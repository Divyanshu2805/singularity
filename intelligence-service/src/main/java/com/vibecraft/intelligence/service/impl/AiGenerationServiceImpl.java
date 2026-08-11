package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectPermission;
import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.entity.ChatSession;
import com.vibecraft.intelligence.entity.ChatSessionId;
import com.vibecraft.intelligence.enums.ChatEventType;
import com.vibecraft.intelligence.enums.UsageFeature;
import com.vibecraft.intelligence.enums.MessageRole;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.LlmResponseParser;
import com.vibecraft.intelligence.llm.PromptUtils;
import com.vibecraft.intelligence.llm.TeachingMode;
import com.vibecraft.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.vibecraft.intelligence.llm.tools.CodeGenerationTools;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.service.AiGenerationService;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import com.vibecraft.intelligence.util.DurationFormat;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
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
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * The build pipeline: a user's message in, generated files and a saved chat turn out.
 *
 * <p>Handles: reserving the daily budget before anything starts, replaying the caller's own recent turns on this
 * project so a build call has memory of earlier decisions, opening the model stream and subscribing to it
 * server-side, reconciling usage, parsing the answer into events, writing and deleting the files it asked for, and
 * saving the turn - plus reattaching to a running generation and stopping one.
 *
 * <p>The budget reservation is claimed synchronously, before the response has started, so a rejection surfaces as a
 * real 402 with the quota numbers on it rather than a generic error event the client could not tell from a provider
 * failure - see {@code reserveBudget}/{@code recentHistory} for what each actually does.
 *
 * <p>Two failure modes are handled rather than hidden. A turn that announced an edit - through a tool log or a
 * checklist - and produced none is retried once to completion, and flagged in the transcript if the retry also
 * produces nothing, instead of looking like a silent success. A turn that ran out of output budget, or that wrote
 * only some of the files it listed, gets a note saying so next to the unticked steps.
 *
 * <p>Individual failures degrade rather than cascade: a file that cannot be written is skipped and logged while the
 * rest of the turn proceeds, and if saving the events as one batch is rejected they are retried one at a time,
 * because losing the whole transcript after the files were already written looks like a broken product. A file that
 * failed to save is never recorded as if it had - its event is stripped before the turn is persisted, with a message
 * naming what didn't save - and if any save failed, every delete in the same turn is withheld too, since a rename is
 * a new file plus a delete of the old path with nothing marking them as a pair, and applying the delete anyway could
 * destroy the only surviving copy of that content.
 *
 * <p>A model stream must be retried by rebuilding the whole call rather than by attaching a retry to the built
 * stream: the advisor chain is single-use per subscription and throws on a second attempt otherwise.
 *
 * <p>Access is rechecked a second time, right before the file writes/deletes commit, because the one {@code
 * @PreAuthorize} on streamResponse only ran once, well before this asynchronous save runs - a project delete or
 * membership removal mid-generation must not still land through the internal write endpoints those checks don't
 * guard. stopGenerationsForProject lets workspace-service also cut the model call short on the same events, but that
 * alone cannot close this gap: once the stream itself has finished, stopping the (already-disposed) subscription does
 * nothing, so the recheck before commit is what actually keeps a revoked caller's changes out.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AiGenerationServiceImpl implements AiGenerationService {

    private static final int MAX_REPLAYED_TURNS = 10;

    private final ChatClient chatClient;
    private final AuthUtil authUtil;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final ProjectFileReader projectFileReader;
    private final FileTreeContextAdvisor fileTreeContextAdvisor;
    private final ChatSessionRepository chatSessionRepository;
    private final LlmResponseParser llmResponseParser;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatEventRepository chatEventRepository;
    private final UsageService usageService;
    private final AiUsageRecorder aiUsageRecorder;
    private final GenerationRegistry generationRegistry;

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Flux<StreamResponse> streamResponse(String userMessage, Long projectId, boolean teachingMode) {

        Long userId = authUtil.getCurrentUserId();

        // Registering the generation first, and reserving budget second, means a project already mid-generation is
        // refused before it ever touches the daily counter - see GenerationRegistry for why this is now one-per-
        // project, not one-per-project-per-user.
        ActiveGeneration generation = generationRegistry.start(projectId, userId, userMessage, teachingMode);

        UsageReservation reservation;
        try {
            reservation = usageService.reserveBudget();
        } catch (RuntimeException e) {
            generationRegistry.remove(generation);
            throw e;
        }
        generation.setReservation(reservation);

        ChatSession chatSession = createChatSessionIfNotExists(projectId, userId);
        TeachingMode teaching = resolveTeachingMode(teachingMode, userId, projectId);
        List<Message> history = recentHistory(chatSession);

        Map<String, Object> advisorParams = Map.of(
                "userId", userId,
                "projectId", projectId
        );

        StringBuilder fullResponseBuffer = new StringBuilder();
        CodeGenerationTools codeGenerationTools = new CodeGenerationTools(projectFileReader, projectId);

        AtomicReference<Long> startTime = new AtomicReference<>(System.currentTimeMillis());
        AtomicReference<Usage> usageRef = new AtomicReference<>();
        AtomicReference<String> finishReason = new AtomicReference<>();

        Disposable subscription;
        try {
            subscription = buildGenerationFlux(userMessage, history, advisorParams, codeGenerationTools, teaching)
                    .subscribe(response -> {
                        if(response.getMetadata().getUsage() != null) {
                            usageRef.set(response.getMetadata().getUsage());
                        }

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
                        reconcileInterrupted(generation, usageRef.get());
                    }, () -> {
                        long endTime = System.currentTimeMillis();
                        generation.markStreamComplete();
                        Schedulers.boundedElastic().schedule(() -> {
                            long duration = Math.max(1, (endTime - startTime.get()) / 1000);
                            try {
                                finalizeChats(userMessage, chatSession, fullResponseBuffer.toString(), duration,
                                        usageRef.get(), teaching, finishReason.get(), generation.takeReservation(), history);
                            } catch (Exception e) {
                                log.error("Failed to finalize chat for projectId: {}. Raw response was: {}", projectId, fullResponseBuffer, e);
                            } finally {
                                generationRegistry.remove(generation);
                            }
                        });
                    });
        } catch (RuntimeException e) {
            generationRegistry.remove(generation);
            aiUsageRecorder.release(reservation);
            throw e;
        }
        generation.setSubscription(subscription);

        return generation.watch();
    }

    /**
     * Trues up the reservation for a generation that ended without ever reaching {@code finalizeChats} - stopped by a
     * user/revocation, or a provider error mid-stream. Neither path gets a final usage chunk from the provider in
     * practice (streamed usage arrives, if at all, only in the last chunk of a run that finished normally), so real
     * numbers are used when they happen to be available and a rough character-based estimate of the text actually
     * produced is recorded otherwise - closer to the truth than recording nothing, which is what let a stopped run
     * disappear from the ledger entirely despite real provider spend.
     */
    private void reconcileInterrupted(ActiveGeneration generation, Usage realUsage) {
        UsageReservation reservation = generation.takeReservation();
        if (reservation == null) {
            return;
        }
        Schedulers.boundedElastic().schedule(() -> {
            try {
                if (realUsage != null && realUsage.getTotalTokens() != null && realUsage.getTotalTokens() > 0) {
                    aiUsageRecorder.reconcile(reservation, realUsage, UsageFeature.BUILD, generation.projectId());
                    return;
                }
                String textSoFar = generation.textSoFar();
                if (textSoFar.isBlank()) {
                    aiUsageRecorder.release(reservation);
                    return;
                }
                int estimatedTokens = Math.max(1, textSoFar.length() / 4);
                usageService.reconcileBudget(reservation, new UsageRecord(
                        reservation.userId(), generation.projectId(), UsageFeature.BUILD, 0, estimatedTokens, estimatedTokens));
                log.info("Recorded an estimated {} token(s) for an interrupted generation with no final usage " +
                        "reported by the provider, projectId: {}", estimatedTokens, generation.projectId());
            } catch (Exception e) {
                log.warn("Couldn't reconcile usage for an interrupted generation on projectId: {}", generation.projectId(), e);
            }
        });
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
            if (active.status() == ActiveGeneration.Status.RUNNING) {
                active.stop(new GenerationStoppedException());
                generationRegistry.remove(active);
                reconcileInterrupted(active, null);
                log.info("Generation stopped by the user for projectId: {}", projectId);
            }
        });
        return generation.isPresent();
    }

    @Override
    public void stopGenerationsForProject(Long projectId, Long userId) {
        List<ActiveGeneration> generations = userId != null
                ? generationRegistry.find(projectId, userId).map(List::of).orElseGet(List::of)
                : generationRegistry.findAllForProject(projectId);

        for (ActiveGeneration generation : generations) {
            if (generation.status() == ActiveGeneration.Status.RUNNING) {
                generation.stop(new GenerationStoppedException());
                reconcileInterrupted(generation, null);
                log.info("Stopped generation for projectId: {}, userId: {} (project or membership revoked)",
                        projectId, generation.userId());
            }
            generationRegistry.remove(generation);
        }
    }

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

    private Flux<ChatResponse> buildGenerationFlux(String userMessage, List<Message> history, Map<String, Object> advisorParams,
                                                   CodeGenerationTools tools, TeachingMode teaching) {
        List<Message> messages = new ArrayList<>(history);
        messages.add(new UserMessage(userMessage));

        return Flux.defer(() -> chatClient.prompt()
                        .system(PromptUtils.getSystemPrompt(teaching))
                        .messages(messages)
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
     * Bounded conversation memory for a build turn: the caller's own last {@value #MAX_REPLAYED_TURNS} exchanges on
     * this project, condensed rather than replayed verbatim - an assistant turn becomes what it said plus which
     * files it touched, not the full file bodies the model can already re-read on demand via its tool. Never crosses
     * chat sessions, so it can never surface another member's conversation: {@code ChatSession} is keyed by project
     * and user, and this only ever reads the caller's own.
     */
    List<Message> recentHistory(ChatSession chatSession) {
        List<ChatMessage> turns = chatMessageRepository.findByChatSession(chatSession);
        int from = Math.max(0, turns.size() - MAX_REPLAYED_TURNS * 2);
        List<Message> history = new ArrayList<>();
        for (ChatMessage turn : turns.subList(from, turns.size())) {
            if (turn.getRole() == MessageRole.USER) {
                if (turn.getContent() != null && !turn.getContent().isBlank()) {
                    history.add(new UserMessage(turn.getContent()));
                }
            } else {
                String summary = summarizeAssistantTurn(turn);
                if (!summary.isBlank()) {
                    history.add(new AssistantMessage(summary));
                }
            }
        }
        return history;
    }

    private String summarizeAssistantTurn(ChatMessage turn) {
        List<ChatEvent> turnEvents = turn.getEvents();
        if (turnEvents == null || turnEvents.isEmpty()) {
            return "";
        }
        String spoken = turnEvents.stream()
                .filter(event -> event.getType() == ChatEventType.MESSAGE)
                .map(ChatEvent::getContent)
                .filter(content -> content != null && !content.isBlank())
                .collect(Collectors.joining(" "));
        List<String> touched = turnEvents.stream()
                .filter(event -> (event.getType() == ChatEventType.FILE_EDIT || event.getType() == ChatEventType.FILE_DELETE)
                        && event.getFilePath() != null)
                .map(ChatEvent::getFilePath)
                .distinct()
                .toList();

        StringBuilder summary = new StringBuilder(spoken);
        if (!touched.isEmpty()) {
            if (!summary.isEmpty()) {
                summary.append(' ');
            }
            summary.append("(Files touched: ").append(String.join(", ", touched)).append(")");
        }
        return summary.toString();
    }

    private String collectFullResponse(String userMessage, List<Message> history, Map<String, Object> advisorParams,
                                       CodeGenerationTools tools, TeachingMode teaching, Long userId, Long projectId) {
        StringBuilder buffer = new StringBuilder();
        AtomicReference<Usage> retryUsage = new AtomicReference<>();
        buildGenerationFlux(userMessage, history, advisorParams, tools, teaching)
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

    private boolean looksLikeAbandonedEdit(List<ChatEvent> events) {
        boolean announcedEdit = events.stream()
                .anyMatch(e -> e.getType() == ChatEventType.TOOL_LOG || e.getType() == ChatEventType.TODO);
        boolean producedFileEdit = events.stream()
                .anyMatch(e -> e.getType() == ChatEventType.FILE_EDIT || e.getType() == ChatEventType.FILE_DELETE);
        return announcedEdit && !producedFileEdit;
    }

    private void finalizeChats(String userMessage, ChatSession chatSession, String fullText, Long duration, Usage usage,
                               TeachingMode teaching, String finishReason, UsageReservation reservation, List<Message> history) {
        Long projectId = chatSession.getId().getProjectId();

        // Reconciled first, before anything else here has a chance to throw: once this runs, the reservation is
        // trued up and must never be touched again, so nothing later in this method may retry or repeat it.
        aiUsageRecorder.reconcile(reservation, usage, UsageFeature.BUILD, projectId);

        Integer promptTokens = usage != null ? usage.getPromptTokens() : null;
        Integer completionTokens = usage != null ? usage.getCompletionTokens() : null;

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
                    "userId", chatSession.getId().getUserId(),
                    "projectId", projectId
            );
            CodeGenerationTools tools = new CodeGenerationTools(projectFileReader, projectId);

            long retryStart = System.currentTimeMillis();
            String retryText = collectFullResponse(userMessage, history, advisorParams, tools, teaching,
                    chatSession.getId().getUserId(), projectId);
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

        appendUnfinishedNotice(chatEventList, assistantChatMessage, projectId, finishReason);

        chatEventList.addFirst(ChatEvent.builder()
                        .type(ChatEventType.THOUGHT)
                        .chatMessage(assistantChatMessage)
                        .content(retried
                                ? "Worked for " + DurationFormat.worked(duration) + " (retried once after an incomplete first attempt)"
                                : "Worked for " + DurationFormat.worked(duration))
                        .sequenceOrder(0)
                .build());

        if (stillAuthorizedToCommit(projectId, chatSession.getId().getUserId())) {
            Set<String> failedPaths = commitFileChanges(chatEventList, projectId);
            if (!failedPaths.isEmpty()) {
                chatEventList.removeIf(event -> (event.getType() == ChatEventType.FILE_EDIT || event.getType() == ChatEventType.FILE_DELETE)
                        && failedPaths.contains(event.getFilePath()));
                chatEventList.add(ChatEvent.builder()
                        .type(ChatEventType.MESSAGE)
                        .chatMessage(assistantChatMessage)
                        .content("Couldn't save " + (failedPaths.size() == 1 ? "this file" : "these files") + ": "
                                + String.join(", ", failedPaths) + ". Please try again.")
                        .sequenceOrder(chatEventList.size() + 1)
                        .build());
            }
        } else {
            long discarded = chatEventList.stream()
                    .filter(e -> e.getType() == ChatEventType.FILE_EDIT || e.getType() == ChatEventType.FILE_DELETE)
                    .count();
            log.warn("Discarding {} generated file change(s) for projectId: {} - the initiating user no longer has " +
                    "edit access (project deleted or membership revoked mid-generation).", discarded, projectId);
            chatEventList.add(ChatEvent.builder()
                    .type(ChatEventType.MESSAGE)
                    .chatMessage(assistantChatMessage)
                    .content("Your access to this project changed while this was generating, so its file changes weren't saved.")
                    .sequenceOrder(chatEventList.size() + 1)
                    .build());
        }

        saveChatEvents(chatEventList, projectId);
    }

    /**
     * Rechecks edit access right before committing, since {@code streamResponse}'s {@code @PreAuthorize} only ran
     * once, well before this asynchronous save - a project delete or member removal mid-generation would otherwise
     * still land through workspaceServiceClient's unguarded internal write endpoints. Fails open (lets the commit
     * proceed) only when workspace-service itself could not be reached, since that is a transient infrastructure
     * failure rather than a revocation signal, and this runs in the background with no request to fail instead.
     */
    private boolean stillAuthorizedToCommit(Long projectId, Long userId) {
        try {
            ProjectMembershipDto membership = workspaceServiceClient.getMembership(projectId, userId);
            return membership.role() != null && membership.role().permissions().contains(ProjectPermission.EDIT);
        } catch (FeignException.NotFound e) {
            return false;
        } catch (Exception e) {
            log.warn("Couldn't verify project access before committing generated changes for projectId: {}, " +
                    "userId: {} - proceeding, since workspace-service was unreachable rather than a confirmed revoke.",
                    projectId, userId, e);
            return true;
        }
    }

    /**
     * Writes every generated file, then deletes - unless a save failed, in which case every delete this turn is
     * skipped rather than guessed at. A rename is written as a new file plus a delete of the old path with nothing
     * marking them as a pair; if the new file's save failed, applying the delete anyway would destroy the only
     * surviving copy of that content on a guess that it was unrelated. Returns every path that did not actually end
     * up saved/deleted, so the caller can strip those events from what gets persisted - a failed write must never be
     * recorded as if it succeeded.
     */
    Set<String> commitFileChanges(List<ChatEvent> chatEventList, Long projectId) {
        List<ChatEvent> fileEditEvents = chatEventList.stream()
                .filter(e -> e.getType() == ChatEventType.FILE_EDIT)
                .toList();

        Set<String> failedPaths = new LinkedHashSet<>();
        int savedCount = 0;
        for (ChatEvent event : fileEditEvents) {
            event.setPreviousContent(previousContentOf(projectId, event.getFilePath()));
            try {
                workspaceServiceClient.saveFile(projectId, new FileContentDto(event.getFilePath(), event.getContent()));
                savedCount++;
            } catch (Exception e) {
                log.error("Failed to save file '{}' for projectId: {}. Skipping this file; other files and " +
                        "chat history are unaffected.", event.getFilePath(), projectId, e);
                failedPaths.add(event.getFilePath());
            }
        }
        if (savedCount < fileEditEvents.size()) {
            log.warn("Saved {}/{} generated file(s) for projectId: {}", savedCount, fileEditEvents.size(), projectId);
        }

        List<ChatEvent> deleteEvents = chatEventList.stream()
                .filter(e -> e.getType() == ChatEventType.FILE_DELETE)
                .toList();
        if (!failedPaths.isEmpty() && !deleteEvents.isEmpty()) {
            log.warn("Skipping {} delete(s) for projectId: {} because {} edit(s) failed in the same turn - a " +
                    "delete may be the other half of a rename whose replacement never saved.",
                    deleteEvents.size(), projectId, failedPaths.size());
            deleteEvents.forEach(event -> failedPaths.add(event.getFilePath()));
        } else {
            for (ChatEvent event : deleteEvents) {
                try {
                    workspaceServiceClient.deleteFile(projectId, event.getFilePath());
                } catch (Exception e) {
                    log.error("Failed to delete file '{}' for projectId: {}. Other changes are unaffected.",
                            event.getFilePath(), projectId, e);
                    failedPaths.add(event.getFilePath());
                }
            }
        }
        return failedPaths;
    }

    private String previousContentOf(Long projectId, String path) {
        try {
            return workspaceServiceClient.getFileContent(projectId, path).content();
        } catch (FeignException.NotFound e) {
            return "";
        } catch (Exception e) {
            log.warn("Couldn't read the previous version of '{}' for projectId: {} - its diff won't be available", path, projectId, e);
            return null;
        }
    }

    private void appendUnfinishedNotice(List<ChatEvent> events, ChatMessage assistantChatMessage,
                                        Long projectId, String finishReason) {
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
                .chatMessage(assistantChatMessage)
                .content(reason + remaining + " Use Retry to carry on from here.")
                .sequenceOrder(events.size() + 1)
                .build());
    }

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
        return chatSessionRepository.findById(chatSessionId)
                .orElseGet(() -> chatSessionRepository.save(ChatSession.builder().id(chatSessionId).build()));
    }
}
