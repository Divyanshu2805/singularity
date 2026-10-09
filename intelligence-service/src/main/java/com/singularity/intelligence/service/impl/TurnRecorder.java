package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.ProjectMembershipDto;
import com.singularity.common.dto.ProjectPermission;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.util.DurationFormat;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Saves a finished build turn: its files as one revision, and the conversation record of what happened.
 *
 * <p>Handles: storing the user's message and the assistant's reply - marked as a teaching turn when it was asked for
 * as one - publishing the turn's file changes atomically
 * after rechecking that the person who asked may still edit the project, recording each edited file's previous
 * version for the diff view, recording on the reply the revision its files were published as - which is what the
 * chat's Undo restores to just before - and writing the turn's events - the "worked for" line first, carrying how the turn ended.
 *
 * <p>Every ending is recorded, not only a successful one. A turn that was stopped or that failed used to leave no
 * trace on the server: the question and whatever had been said were kept only by the browser that asked, and were
 * gone after a refresh or on another device. Such a turn is now stored with its messages and a note saying nothing
 * was changed, and never with its file changes - a turn's files land together or not at all. A turn cut short
 * because the daily allowance ran out is the exception, like one that ended short of its plan: the files it finished
 * were paid for, so they are published and the note says what is still to come.
 *
 * <p>A failed publish is never recorded as if it had succeeded: every changed path's event is removed before the turn
 * is saved, with a message naming what didn't save - or, when workspace-service refused the change for a reason the
 * person can act on (the project would grow past its size limits), with that reason as it was given. The whole
 * turn's files go in one publish call, so a rename - a
 * new file plus a delete of the old path - can no longer be left half applied.
 *
 * <p>Access is rechecked here, right before the files commit, because the permission check on the request ran once,
 * well before this asynchronous save. A project delete or a membership removal mid-generation must not still land
 * through workspace-service's internal write endpoint, which that check does not guard. The recheck fails open only
 * when workspace-service itself cannot be reached, since that is a transient failure and not a sign of a revoke.
 *
 * <p>Saving the events as one batch is retried one at a time if rejected, because losing the whole transcript after
 * the files were already published looks like a broken product.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TurnRecorder {

    record TurnRecord(ChatSession chatSession, String userMessage, List<ParsedEvent> events, TurnOutcome outcome,
                      List<String> notices, long durationSeconds, Integer promptTokens, Integer completionTokens,
                      boolean teaching) {

        TurnRecord(ChatSession chatSession, String userMessage, List<ParsedEvent> events, TurnOutcome outcome,
                   List<String> notices, long durationSeconds, Integer promptTokens, Integer completionTokens) {
            this(chatSession, userMessage, events, outcome, notices, durationSeconds, promptTokens, completionTokens, false);
        }
    }

    static final String ACCESS_CHANGED_NOTICE =
            "Your access to this project changed while this was generating, so its file changes weren't saved.";

    private final WorkspaceServiceClient workspaceServiceClient;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatEventRepository chatEventRepository;
    private final LlmResponseParser llmResponseParser;

    TurnOutcome record(TurnRecord turn) {
        ChatSession chatSession = turn.chatSession();
        Long projectId = chatSession.getId().getProjectId();
        Long userId = chatSession.getId().getUserId();

        chatMessageRepository.save(ChatMessage.builder()
                .chatSession(chatSession)
                .role(MessageRole.USER)
                .content(turn.userMessage())
                .tokensUsed(turn.promptTokens())
                .build());
        ChatMessage reply = chatMessageRepository.save(ChatMessage.builder()
                .chatSession(chatSession)
                .role(MessageRole.ASSISTANT)
                .tokensUsed(turn.completionTokens())
                .teaching(turn.teaching())
                .build());

        boolean keepsChanges = turn.outcome() == null || turn.outcome() == TurnOutcome.INCOMPLETE
                || turn.outcome() == TurnOutcome.OUT_OF_BUDGET;
        List<ParsedEvent> kept = keepsChanges
                ? turn.events()
                : turn.events().stream().filter(event -> !event.isFileChange()).toList();
        List<ChatEvent> events = new ArrayList<>(llmResponseParser.toChatEvents(kept, reply));
        List<String> notices = new ArrayList<>(turn.notices());

        TurnOutcome outcome = turn.outcome();
        if (events.stream().anyMatch(TurnRecorder::isFileChange)) {
            if (!stillAuthorizedToCommit(projectId, userId)) {
                log.warn("Discarding the generated file change(s) for projectId: {} - the initiating user no longer "
                        + "has edit access (project deleted or membership revoked mid-generation).", projectId);
                events.removeIf(TurnRecorder::isFileChange);
                notices.add(ACCESS_CHANGED_NOTICE);
                outcome = TurnOutcome.NOT_SAVED;
            } else {
                PublishRevisionResponse revision = commitFileChanges(events, projectId, userId);
                if (revision.status() == PublishRevisionResponse.Status.APPLIED) {
                    Map<String, String> before = revision.previousContent() == null ? Map.of() : revision.previousContent();
                    events.stream()
                            .filter(event -> event.getType() == ChatEventType.FILE_EDIT)
                            .forEach(event -> event.setPreviousContent(before.get(event.getFilePath())));
                    outcome = outcome == null ? TurnOutcome.SAVED : outcome;
                    reply.setRevisionId(revision.revisionId());
                    chatMessageRepository.save(reply);
                } else {
                    List<String> failedPaths = revision.failedPaths();
                    events.removeIf(TurnRecorder::isFileChange);
                    notices.add(revision.reason() != null && !revision.reason().isBlank()
                            ? revision.reason()
                            : "Couldn't save " + (failedPaths.size() == 1 ? "this file" : "these files") + ": "
                                    + String.join(", ", failedPaths) + ". Please try again.");
                    outcome = TurnOutcome.NOT_SAVED;
                }
            }
        } else if (outcome == null) {
            outcome = TurnOutcome.ANSWERED;
        }

        int order = 1;
        for (ChatEvent event : events) {
            event.setSequenceOrder(order++);
        }
        for (String notice : notices) {
            events.add(ChatEvent.builder()
                    .type(ChatEventType.MESSAGE)
                    .chatMessage(reply)
                    .content(notice)
                    .sequenceOrder(order++)
                    .build());
        }
        events.addFirst(ChatEvent.builder()
                .type(ChatEventType.THOUGHT)
                .chatMessage(reply)
                .content("Worked for " + DurationFormat.worked(turn.durationSeconds()))
                .metadata(outcome.name())
                .sequenceOrder(0)
                .build());

        saveChatEvents(events, projectId);
        return outcome;
    }

    private static boolean isFileChange(ChatEvent event) {
        return event.getType() == ChatEventType.FILE_EDIT || event.getType() == ChatEventType.FILE_DELETE;
    }

    private boolean stillAuthorizedToCommit(Long projectId, Long userId) {
        try {
            ProjectMembershipDto membership = workspaceServiceClient.getMembership(projectId, userId);
            return membership.role() != null && membership.role().permissions().contains(ProjectPermission.EDIT);
        } catch (FeignException.NotFound e) {
            return false;
        } catch (Exception e) {
            log.warn("Couldn't verify project access before committing generated changes for projectId: {}, "
                            + "userId: {} - proceeding, since workspace-service was unreachable rather than a confirmed revoke.",
                    projectId, userId, e);
            return true;
        }
    }

    private PublishRevisionResponse commitFileChanges(List<ChatEvent> events, Long projectId, Long userId) {
        List<FileChangeDto> changes = new ArrayList<>();
        for (ChatEvent event : events) {
            if (event.getType() == ChatEventType.FILE_EDIT) {
                changes.add(new FileChangeDto(event.getFilePath(), FileChangeDto.ChangeType.EDIT, event.getContent()));
            } else if (event.getType() == ChatEventType.FILE_DELETE) {
                changes.add(new FileChangeDto(event.getFilePath(), FileChangeDto.ChangeType.DELETE, null));
            }
        }
        List<String> paths = changes.stream().map(FileChangeDto::path).toList();
        try {
            PublishRevisionResponse response = workspaceServiceClient.publishRevision(projectId,
                    new PublishRevisionRequest(null, userId, "AI_GENERATION", changes));
            if (response.status() == PublishRevisionResponse.Status.APPLIED) {
                return response;
            }
            log.error("Revision for projectId: {} was not applied ({}) - {} file change(s) not saved.",
                    projectId, response.status(), changes.size());
            return new PublishRevisionResponse(response.revisionId(), response.status(), response.currentRevisionId(),
                    paths, response.previousContent() == null ? Map.of() : response.previousContent(), response.reason());
        } catch (Exception e) {
            log.error("Failed to publish revision for projectId: {} - {} file change(s) not saved.", projectId, changes.size(), e);
            return new PublishRevisionResponse(null, PublishRevisionResponse.Status.FAILED, null, paths, Map.of());
        }
    }

    private void saveChatEvents(List<ChatEvent> events, Long projectId) {
        try {
            chatEventRepository.saveAll(events);
        } catch (Exception batchFailure) {
            log.error("Batch-saving {} chat event(s) failed for projectId: {} - retrying individually so the "
                    + "rest of the conversation survives.", events.size(), projectId, batchFailure);

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
}
