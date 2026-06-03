package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.StreamResponse;
import com.java.vibecraft.entity.*;
import com.java.vibecraft.enums.ChatEventType;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

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

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Flux<StreamResponse> streamResponse(String userMessage, Long projectId, boolean teachingMode) {

//        usageService.checkDailyTokensUsage();

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
        AtomicReference<Long> endTime = new AtomicReference<>(0L);
        AtomicReference<Usage> usageRef = new AtomicReference<>();

        return buildGenerationFlux(userMessage, advisorParams, codeGenerationTools, teaching)
                .doOnNext(response -> {
                    if(response.getMetadata().getUsage() != null) {
                        usageRef.set(response.getMetadata().getUsage());
                    }

                    // The trailing chunk that carries usage stats (stream-usage: true) has no
                    // choices at all, so getResult() is null here - nothing else to do with it.
                    if(response.getResult() == null) {
                        return;
                    }

                    String content = response.getResult().getOutput().getText();

                    if(content != null && !content.isEmpty() && endTime.get() == 0) { // first non-empty chunk received
                        endTime.set(System.currentTimeMillis());
                    }

                    fullResponseBuffer.append(content);
                })
                .doOnComplete(() -> {
                    Schedulers.boundedElastic().schedule(() -> {
                        long duration = (endTime.get() - startTime.get()) /  1000;
                        try {
                            finalizeChats(userMessage, chatSession, fullResponseBuffer.toString(), duration, usageRef.get(), teaching);
                        } catch (Exception e) {
                            log.error("Failed to finalize chat for projectId: {}. Raw response was: {}", projectId, fullResponseBuffer, e);
                        }
                    });
                })
                .doOnError(error -> log.error("Error during streaming for projectId: {}", projectId))
                .map(response -> {
                    if(response.getResult() == null) {
                        return new StreamResponse("");
                    }
                    String text = response.getResult().getOutput().getText();
                    return new StreamResponse(text != null ? text : "");
                });
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
    private String collectFullResponse(String userMessage, Map<String, Object> advisorParams, CodeGenerationTools tools,
                                       TeachingMode teaching) {
        StringBuilder buffer = new StringBuilder();
        buildGenerationFlux(userMessage, advisorParams, tools, teaching)
                .doOnNext(response -> {
                    if (response.getResult() == null) return;
                    String content = response.getResult().getOutput().getText();
                    if (content != null) buffer.append(content);
                })
                .blockLast();
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
        boolean producedFileEdit = events.stream().anyMatch(e -> e.getType() == ChatEventType.FILE_EDIT);
        return announcedEdit && !producedFileEdit;
    }

    private void finalizeChats(String userMessage, ChatSession chatSession, String fullText, Long duration, Usage usage,
                               TeachingMode teaching) {
        Long projectId = chatSession.getProject().getId();

        Integer promptTokens = null;
        Integer completionTokens = null;

        if(usage != null) {
            usageService.recordTokenUsage(chatSession.getUser().getId(), usage.getTotalTokens());
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
            String retryText = collectFullResponse(userMessage, advisorParams, tools, teaching);
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

        chatEventList.addFirst(ChatEvent.builder()
                        .type(ChatEventType.THOUGHT)
                        .chatMessage(assistantChatMessage)
                        .content(retried ? "Thought for " + duration + "s (retried once after an incomplete first attempt)"
                                : "Thought for " + duration + "s")
                        .sequenceOrder(0)
                .build());

        List<ChatEvent> fileEditEvents = chatEventList.stream()
                .filter(e -> e.getType() == ChatEventType.FILE_EDIT)
                .toList();

        int savedCount = 0;
        for (ChatEvent event : fileEditEvents) {
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

        saveChatEvents(chatEventList, projectId);
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