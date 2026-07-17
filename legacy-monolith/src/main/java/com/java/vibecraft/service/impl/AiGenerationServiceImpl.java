package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.ActiveGenerationResponse;
import com.java.vibecraft.dto.chat.StreamResponse;
import com.java.vibecraft.entity.*;
import com.java.vibecraft.enums.ChatEventType;
import com.java.vibecraft.enums.UsageFeature;
import com.java.vibecraft.enums.MessageRole;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.llm.LlmResponseParser;
import com.java.vibecraft.llm.PromptUtils;
import com.java.vibecraft.llm.TeachingMode;
import com.java.vibecraft.llm.advisors.FileTreeContextAdvisor;
import com.java.vibecraft.llm.tools.CodeGenerationTools;
import com.java.vibecraft.repository.*;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.AiGenerationService;
import com.java.vibecraft.service.ProjectFileService;
import com.java.vibecraft.service.UsageService;
import com.java.vibecraft.util.DurationFormat;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiGenerationServiceImpl implements AiGenerationService {

    private final ChatClient chatClient;
    private final AuthUtil authUtil;
    private final ProjectFileService projectFileService;
    private final FileTreeContextAdvisor fileTreeContextAdvisor;
    private final ChatSessionRepository chatSessionRepository;
    private final ProjectRepository projectRepository;
    private final LlmResponseParser llmResponseParser;
    private final UserRepository userRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatEventRepository chatEventRepository;
    private final UsageService usageService;
    private final com.java.vibecraft.llm.AiUsageRecorder aiUsageRecorder;
    private final GenerationRegistry generationRegistry;

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Flux<StreamResponse> streamResponse(String userMessage, Long projectId, boolean teachingMode) {

        // Thrown here, synchronously, rather than inside the Flux: the controller has not started writing the
        // SSE response yet, so this surfaces as a real 402 with the quota numbers on it. Raised after the
        // stream opens it could only ever be a generic "error" event, and the client could not tell a spent
        // allowance from a provider failure.
        usageService.assertWithinDailyTokenBudget();

        Long userId = authUtil.getCurrentUserId();
        ChatSession chatSession = createChatSessionIfNotExists(projectId, userId);
        TeachingMode teaching = resolveTeachingMode(teachingMode, userId, projectId);

        Map<String, Object> advisorParams = Map.of(
                "userId", userId,
                "projectId", projectId
        );

        StringBuilder fullResponseBuffer = new StringBuilder();
        CodeGenerationTools codeGenerationTools = new CodeGenerationTools(projectFileService, projectId);

        AtomicReference<Long> startTime = new AtomicReference<>(System.currentTimeMillis());
        AtomicReference<Usage> usageRef = new AtomicReference<>();
        // Why the model stopped. "length" means it ran out of output budget mid-answer - the stream still
        // completes normally, so without reading this a truncated build is indistinguishable from a finished one.
        AtomicReference<String> finishReason = new AtomicReference<>();

        ActiveGeneration generation = generationRegistry.start(projectId, userId, userMessage, teachingMode);

        // Subscribed here, by the server, and not by the HTTP response: the generation now belongs to nobody's
        // connection, so a refresh, a closed tab or a dropped network can't cancel it. The response only watches it.
        Disposable subscription;
        try {
            subscription = buildGenerationFlux(userMessage, advisorParams, codeGenerationTools, teaching)
                    .subscribe(response -> {
                        if(response.getMetadata().getUsage() != null) {
                            usageRef.set(response.getMetadata().getUsage());
                        }

                        // The trailing chunk that carries usage stats (stream-usage: true) has no
                        // choices at all, so getResult() is null here - nothing else to do with it.
                        if(response.getResult() == null) {
                            return;
                        }

                        String reason = response.getResult().getMetadata() == null
                                ? null
                                : response.getResult().getMetadata().getFinishReason();
                        if (reason != null && !reason.isBlank()) {
                            finishReason.set(reason);
                        }

                        String text = response.getResult().getOutput().getText();
                        if (text != null) {
                            fullResponseBuffer.append(text);
                            generation.append(text);
                        }
                    }, error -> {
                        log.error("Error during generation for projectId: {}", projectId, error);
                        generation.markFailed(error);
                        generationRegistry.remove(generation);
                    }, () -> {
                        // Measured to the end of the stream, not to the first token. The browser shows its own
                        // elapsed time while the answer is still arriving, and a saved "Thought for 2s" replacing
                        // the 27s the user just watched on the next refresh is simply wrong.
                        long endTime = System.currentTimeMillis();
                        generation.markStreamComplete();
                        Schedulers.boundedElastic().schedule(() -> {
                            long duration = Math.max(1, (endTime - startTime.get()) / 1000);
                            try {
                                finalizeChats(userMessage, chatSession, fullResponseBuffer.toString(), duration,
                                        usageRef.get(), teaching, finishReason.get());
                            } catch (Exception e) {
                                log.error("Failed to finalize chat for projectId: {}. Raw response was: {}", projectId, fullResponseBuffer, e);
                            } finally {
                                // Only now: until the turn is saved, a refreshed page still needs to find it here rather
                                // than in a history that doesn't have it yet.
                                generationRegistry.remove(generation);
                            }
                        });
                    });
        } catch (RuntimeException e) {
            // Failing before it ever started must not leave the project looking busy until a restart.
            generationRegistry.remove(generation);
            throw e;
        }
        generation.setSubscription(subscription);

        return generation.watch();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId) {
        return generationRegistry.find(projectId, authUtil.getCurrentUserId())
                .map(generation -> new ActiveGenerationResponse(
                        generation.userMessage(),
                        generation.startedAt(),
                        generation.teachingMode(),
                        generation.status().name()));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Optional<Flux<StreamResponse>> watchActiveGeneration(Long projectId) {
        return generationRegistry.find(projectId, authUtil.getCurrentUserId()).map(ActiveGeneration::watch);
    }

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public boolean stopActiveGeneration(Long projectId) {
        Optional<ActiveGeneration> generation = generationRegistry.find(projectId, authUtil.getCurrentUserId());
        generation.ifPresent(active -> {
            // A generation already saving has nothing left to stop - its model call is over.
            if (active.status() == ActiveGeneration.Status.RUNNING) {
                active.stop(new GenerationStoppedException());
                generationRegistry.remove(active);
                log.info("Generation stopped by the user for projectId: {}", projectId);
            }
        });
        return generation.isPresent();
    }

    /**
     * Teaching mode is resolved once, on the request thread, and then reused by the abandoned-edit retry - nothing
     * is saved between the two attempts, so the already-taught list can't go stale, and {@code finalizeChats} runs
     * with no security context to look the user up again anyway. A failed lookup still honours the toggle, just
     * without the history: a learner who asked for explanations shouldn't lose them over a read that only exists to
     * avoid repeats.
     */
    private TeachingMode resolveTeachingMode(boolean enabled, Long userId, Long projectId) {
        if (!enabled) {
            return TeachingMode.off();
        }
        List<String> alreadyTaught = List.of();
        try {
            alreadyTaught = chatEventRepository.findRecentLessonConcepts(userId, PageRequest.of(0, TeachingMode.RECENT_LESSONS_TO_READ));
        } catch (Exception e) {
            log.warn("Couldn't load already-taught concepts for userId: {} - teaching without them", userId, e);
        }
        TeachingMode teaching = TeachingMode.on(alreadyTaught);
        log.info("Teaching mode on for projectId: {} ({} concept(s) already taught)", projectId, teaching.conceptsAlreadyTaught().size());
        return teaching;
    }

    private Flux<ChatResponse> buildGenerationFlux(String userMessage, Map<String, Object> advisorParams, CodeGenerationTools tools,
                                                   TeachingMode teaching) {
        return Flux.defer(() -> chatClient.prompt()
                        .system(PromptUtils.getSystemPrompt(teaching))
                        .user(userMessage)
                        .tools(tools)
                        .advisors(advisorSpec -> {
                                    advisorSpec.params(advisorParams);
                                    advisorSpec.advisors(fileTreeContextAdvisor);
                                }
                        )
                        .stream()
                        .chatResponse())
                .retryWhen(Retry.backoff(3, Duration.ofSeconds(3))
                        .filter(throwable -> throwable instanceof WebClientResponseException.TooManyRequests)
                        .doBeforeRetry(signal -> log.warn("Rate limited by OpenRouter, retrying (attempt {})", signal.totalRetries() + 1)));
    }

    /**
     * Runs a full (non-streamed) generation and blocks until it completes. Only ever called from
     * {@code finalizeChats}, which itself runs on a boundedElastic thread - never call this from a
     * request thread.
     */
    /**
     * The abandoned-edit retry, run to completion off the live stream. It is a full generation, so it is billed
     * like one: this used to drop the trailing usage chunk entirely, and every retry spent a build's worth of
     * tokens that neither quotas nor insights ever saw. {@code userId}/{@code projectId} are passed in because
     * this runs after the request thread has gone.
     */
    private String collectFullResponse(String userMessage, Map<String, Object> advisorParams, CodeGenerationTools tools,
                                       TeachingMode teaching, Long userId, Long projectId) {
        StringBuilder buffer = new StringBuilder();
        AtomicReference<Usage> retryUsage = new AtomicReference<>();
        buildGenerationFlux(userMessage, advisorParams, tools, teaching)
                .doOnNext(response -> {
                    if (response.getMetadata() != null && response.getMetadata().getUsage() != null
                            && response.getMetadata().getUsage().getTotalTokens() != null
                            && response.getMetadata().getUsage().getTotalTokens() > 0) {
                        retryUsage.set(response.getMetadata().getUsage());
                    }
                    if (response.getResult() == null) return;
                    String content = response.getResult().getOutput().getText();
                    if (content != null) buffer.append(content);
                })
                .blockLast();
        aiUsageRecorder.record(retryUsage.get(), UsageFeature.BUILD_RETRY, userId, projectId);
        return buffer.toString();
    }

    /**
     * Catches the exact failure mode found in production: the model announces a change - via a {@code <tool>}
     * tag saying it's reading files, or a {@code <todo>} checklist naming the files it will write - but the
     * turn ends without ever emitting the {@code <file>} edit, so nothing gets saved and the chat looks like
     * it succeeded. A turn that never announced an edit at all (a plain question, for example) is left alone.
     *
     * <p>The checklist is the stronger signal of the two: a turn that listed the files it would write and
     * wrote none is unambiguously unfinished, and it catches the case where the model planned without
     * reading anything first, which the tool-tag check alone misses.
     */
    private boolean looksLikeAbandonedEdit(List<ChatEvent> events) {
        boolean announcedEdit = events.stream()
                .anyMatch(e -> e.getType() == ChatEventType.TOOL_LOG || e.getType() == ChatEventType.TODO);
        // Deleting counts as doing the change: a turn whose only step removes a file wrote nothing, and isn't unfinished.
        boolean producedFileEdit = events.stream()
                .anyMatch(e -> e.getType() == ChatEventType.FILE_EDIT || e.getType() == ChatEventType.FILE_DELETE);
        return announcedEdit && !producedFileEdit;
    }

    private void finalizeChats(String userMessage, ChatSession chatSession, String fullText, Long duration, Usage usage,
                               TeachingMode teaching, String finishReason) {
        Long projectId = chatSession.getProject().getId();

        Integer promptTokens = null;
        Integer completionTokens = null;

        if(usage != null) {
            aiUsageRecorder.record(usage, UsageFeature.BUILD, chatSession.getUser().getId(), projectId);
            promptTokens = usage.getPromptTokens();
            completionTokens = usage.getCompletionTokens();
        }

        chatMessageRepository.save(
                ChatMessage.builder()
                        .chatSession(chatSession)
                        .role(MessageRole.USER)
                        .content(userMessage)
                        .tokensUsed(promptTokens)
                        .build()
        );

        ChatMessage assistantChatMessage = ChatMessage.builder()
                .role(MessageRole.ASSISTANT)
                .content("Assistant Message here...")
                .chatSession(chatSession)
                .tokensUsed(completionTokens)
                .build();

        assistantChatMessage = chatMessageRepository.save(assistantChatMessage);

        List<ChatEvent> chatEventList = llmResponseParser.parseChatEvents(fullText, assistantChatMessage);
        logParsedEvents("Parsed", chatEventList, projectId, teaching);

        boolean retried = false;
        if (looksLikeAbandonedEdit(chatEventList)) {
            log.warn("Turn for projectId: {} announced a file read/edit but produced no FILE_EDIT — retrying once.", projectId);
            retried = true;

            Map<String, Object> advisorParams = Map.of(
                    "userId", chatSession.getUser().getId(),
                    "projectId", projectId
            );
            CodeGenerationTools tools = new CodeGenerationTools(projectFileService, projectId);

            long retryStart = System.currentTimeMillis();
            // Same teaching mode as the first attempt: the learner asked for lessons on this turn, retried or not.
            String retryText = collectFullResponse(userMessage, advisorParams, tools, teaching,
                    chatSession.getUser().getId(), projectId);
            duration = (System.currentTimeMillis() - retryStart) / 1000;

            List<ChatEvent> retryEvents = llmResponseParser.parseChatEvents(retryText, assistantChatMessage);
            logParsedEvents("Retry parsed", retryEvents, projectId, teaching);

            chatEventList = retryEvents;

            if (looksLikeAbandonedEdit(chatEventList) || chatEventList.isEmpty()) {
                log.error("Retry for projectId: {} still produced no FILE_EDIT — flagging as incomplete instead of a silent no-op.", projectId);
                chatEventList.add(ChatEvent.builder()
                        .type(ChatEventType.MESSAGE)
                        .chatMessage(assistantChatMessage)
                        .content("I started making this change but wasn't able to finish it. Please try sending your request again.")
                        .sequenceOrder(chatEventList.size() + 1)
                        .build());
            }
        }

        appendUnfinishedNotice(chatEventList, projectId, finishReason);

        chatEventList.addFirst(ChatEvent.builder()
                        .type(ChatEventType.THOUGHT)
                        .chatMessage(assistantChatMessage)
                        .content(retried
                                ? "Worked for " + DurationFormat.worked(duration) + " (retried once after an incomplete first attempt)"
                                : "Worked for " + DurationFormat.worked(duration))
                        .sequenceOrder(0)
                .build());

        List<ChatEvent> fileEditEvents = chatEventList.stream()
                .filter(e -> e.getType() == ChatEventType.FILE_EDIT)
                .toList();

        int savedCount = 0;
        for (ChatEvent event : fileEditEvents) {
            // Read before saving over it - after the save, storage no longer has this version anywhere.
            event.setPreviousContent(previousContentOf(projectId, event.getFilePath()));
            try {
                projectFileService.saveFile(projectId, event.getFilePath(), event.getContent());
                savedCount++;
            } catch (Exception e) {
                log.error("Failed to save file '{}' for projectId: {}. Skipping this file; other files and " +
                        "chat history are unaffected.", event.getFilePath(), projectId, e);
            }
        }
        if (savedCount < fileEditEvents.size()) {
            log.warn("Saved {}/{} generated file(s) for projectId: {}", savedCount, fileEditEvents.size(), projectId);
        }

        // After the writes, so a rename (new file + delete of the old one) never leaves the project with neither copy.
        for (ChatEvent event : chatEventList) {
            if (event.getType() != ChatEventType.FILE_DELETE) continue;
            try {
                projectFileService.deleteFile(projectId, event.getFilePath());
            } catch (Exception e) {
                log.error("Failed to delete file '{}' for projectId: {}. Other changes are unaffected.",
                        event.getFilePath(), projectId, e);
            }
        }

        saveChatEvents(chatEventList, projectId);
    }

    /** The file as it is right now, "" if it doesn't exist yet, or null if it couldn't be read (no diff, but no failure). */
    private String previousContentOf(Long projectId, String path) {
        try {
            return projectFileService.getFileContent(projectId, path).content();
        } catch (ResourceNotFoundException e) {
            return "";
        } catch (Exception e) {
            log.warn("Couldn't read the previous version of '{}' for projectId: {} - its diff won't be available", path, projectId, e);
            return null;
        }
    }

    /**
     * Says so, in the transcript, when a turn stopped before it finished what it set out to do.
     *
     * <p>Two ways that happens, neither of which produces an error: the model runs out of output budget
     * mid-answer ({@code finishReason} of {@code length}), or it simply stops after some of the files it
     * listed. Both used to end as a silent success - a checklist with most of its steps unticked and nothing
     * saying why. The unticked steps stay unticked, which is the honest record; this adds the explanation
     * next to them, and tells the reader they can carry on.
     */
    private void appendUnfinishedNotice(List<ChatEvent> events, Long projectId, String finishReason) {
        List<String> planned = events.stream()
                .filter(event -> event.getType() == ChatEventType.TODO && event.getFilePath() != null)
                .map(ChatEvent::getFilePath)
                .toList();
        Set<String> written = events.stream()
                .filter(event -> (event.getType() == ChatEventType.FILE_EDIT || event.getType() == ChatEventType.FILE_DELETE)
                        && event.getFilePath() != null)
                .map(ChatEvent::getFilePath)
                .collect(Collectors.toSet());

        long missing = planned.stream().filter(path -> !written.contains(path)).count();
        boolean ranOutOfRoom = finishReason != null && finishReason.equalsIgnoreCase("length");
        if (missing == 0 && !ranOutOfRoom) {
            return;
        }

        log.warn("Turn for projectId: {} ended early - finishReason: {}, {} of {} planned file(s) never written.",
                projectId, finishReason, missing, planned.size());

        String reason = ranOutOfRoom
                ? "This answer hit the model's length limit before it finished."
                : "This answer stopped before it finished.";
        String remaining = missing == 0
                ? ""
                : " " + (planned.size() - missing) + " of " + planned.size() + " steps are done; the rest weren't started.";

        events.add(ChatEvent.builder()
                .type(ChatEventType.MESSAGE)
                .chatMessage(events.getFirst().getChatMessage())
                .content(reason + remaining + " Use Retry to carry on from here.")
                .sequenceOrder(events.size() + 1)
                .build());
    }

    /**
     * Walkthroughs are counted only for a teaching-mode turn, where they show whether the model is following the
     * {@code <learn>} rules: every file should get one, and the part count says how thoroughly they cover their files.
     */
    private void logParsedEvents(String label, List<ChatEvent> events, Long projectId, TeachingMode teaching) {
        long fileEditCount = events.stream().filter(e -> e.getType() == ChatEventType.FILE_EDIT).count();
        if (!teaching.enabled()) {
            log.info("{} {} chat event(s) ({} file edit(s)) for projectId: {}", label, events.size(), fileEditCount, projectId);
            return;
        }
        List<ChatEvent> lessons = events.stream().filter(e -> e.getType() == ChatEventType.LEARN).toList();
        int partCount = lessons.stream().mapToInt(e -> LlmResponseParser.lessonPartCount(e.getContent())).sum();
        log.info("{} {} chat event(s) ({} file edit(s), {} walkthrough(s) with {} part(s)) for projectId: {}",
                label, events.size(), fileEditCount, lessons.size(), partCount, projectId);
    }

    /**
     * Saves the turn's events, falling back to one at a time if the batch is rejected. {@code saveAll} is
     * all-or-nothing, so a single unsaveable event used to take the whole conversation record with it - the
     * same failure the per-file loop above already guards against, and one that bites hardest here because
     * the generated files have already been written by this point: the project gains files while its chat
     * looks like nothing ever happened. Losing one event is a gap in the transcript; losing all of them
     * looks like a broken product.
     *
     * <p>Safe to retry individually because this class is deliberately not {@code @Transactional}: the failed
     * batch rolls back its own transaction and each retry gets a fresh one.
     */
    private void saveChatEvents(List<ChatEvent> events, Long projectId) {
        try {
            chatEventRepository.saveAll(events);
        } catch (Exception batchFailure) {
            log.error("Batch-saving {} chat event(s) failed for projectId: {} - retrying individually so the " +
                    "rest of the conversation survives.", events.size(), projectId, batchFailure);

            int saved = 0;
            for (ChatEvent event : events) {
                try {
                    chatEventRepository.save(event);
                    saved++;
                } catch (Exception e) {
                    log.error("Dropping unsaveable {} event (sequence {}) for projectId: {}",
                            event.getType(), event.getSequenceOrder(), projectId, e);
                }
            }
            log.warn("Saved {}/{} chat event(s) individually for projectId: {}", saved, events.size(), projectId);
        }
    }

    private ChatSession createChatSessionIfNotExists(Long projectId, Long userId) {
        ChatSessionId chatSessionId = new ChatSessionId(projectId, userId);
        ChatSession chatSession = chatSessionRepository.findById(chatSessionId).orElse(null);

        if(chatSession == null) {
            Project project = projectRepository.findById(projectId)
                    .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString()));

            chatSession = ChatSession.builder()
                    .id(chatSessionId)
                    .project(project)
                    .user(user)
                    .build();

            chatSession = chatSessionRepository.save(chatSession);
        }
        return chatSession;
    }
}