package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileTreeDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.SuggestionPrompts;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.SuggestionService;
import com.singularity.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Suggests what to ask for next, once a build has changed a project.
 *
 * <p>Handles: finding the caller's own last exchange on the project, checking that it really changed files, asking
 * a model for three next steps from what was asked, what was said and which files exist, metering that call, and
 * returning the suggestions - or none.
 *
 * <p>It answers with an empty list for everything that is not a clean result: no conversation yet, a last turn that
 * changed nothing, no allowance left, a provider that failed, an answer with nothing usable in it. Suggestions are a
 * convenience under a finished build, and a convenience that can show an error is worse than one that is absent.
 *
 * <p>Only someone who may edit the project can ask, because a suggestion is a build request waiting to be sent, and
 * it is drawn from the caller's own conversation and nobody else's. It reads file paths and no file contents (see
 * {@link SuggestionPrompts}), and it has no tool: it cannot read or write a file.
 *
 * <p>The call is small - a few hundred tokens in, a few dozen out - and is charged to the caller's daily allowance
 * under its own name, so it shows in their usage as what it is. It is not made at all when the allowance is spent.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SuggestionServiceImpl implements SuggestionService {

    private final AuthUtil authUtil;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ProjectFileReader projectFileReader;
    private final UsageService usageService;
    private final AiUsageRecorder aiUsageRecorder;
    private final ChatClient chatClient;
    private final ModelCalls modelCalls;

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public List<String> nextSteps(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        Optional<ChatSession> session = chatSessionRepository.findById(new ChatSessionId(projectId, userId));
        if (session.isEmpty()) {
            return List.of();
        }
        List<ChatMessage> turns = chatMessageRepository.findByChatSession(session.get());
        if (turns.size() < 2 || turns.getLast().getRole() != MessageRole.ASSISTANT) {
            return List.of();
        }
        ChatMessage reply = turns.getLast();
        List<ChatEvent> events = reply.getEvents() == null ? List.of() : reply.getEvents();
        List<String> touched = events.stream()
                .filter(event -> event.getType() == ChatEventType.FILE_EDIT && event.getFilePath() != null)
                .map(ChatEvent::getFilePath).distinct().toList();
        String request = lastRequest(turns);
        if (touched.isEmpty() || request.isBlank()) {
            return List.of();
        }
        String said = events.stream()
                .filter(event -> event.getType() == ChatEventType.MESSAGE && event.getContent() != null)
                .map(ChatEvent::getContent).reduce("", (all, next) -> all.isEmpty() ? next : all + " " + next);

        UsageReservation reservation;
        try {
            reservation = usageService.reserveBudget(UsageFeature.SUGGEST);
        } catch (QuotaExceededException spent) {
            return List.of();
        }
        try {
            ChatResponse response = modelCalls.apply(chatClient.prompt(), AiCallKind.SUGGEST)
                    .system(SuggestionPrompts.systemPrompt())
                    .user(SuggestionPrompts.block(request, said, touched, projectPaths(projectId)))
                    .call()
                    .chatResponse();
            aiUsageRecorder.reconcile(reservation, response, UsageFeature.SUGGEST, projectId);
            String answer = response == null || response.getResult() == null ? null
                    : response.getResult().getOutput().getText();
            return SuggestionPrompts.parse(answer);
        } catch (RuntimeException e) {
            aiUsageRecorder.release(reservation);
            log.warn("Couldn't get next-step suggestions for projectId: {}", projectId, e);
            return List.of();
        }
    }

    private static String lastRequest(List<ChatMessage> turns) {
        for (int index = turns.size() - 2; index >= 0; index--) {
            ChatMessage turn = turns.get(index);
            if (turn.getRole() == MessageRole.USER) {
                return turn.getContent() == null ? "" : turn.getContent();
            }
        }
        return "";
    }

    private List<String> projectPaths(Long projectId) {
        try {
            return projectFileReader.getFileTree(projectId).entries().stream()
                    .map(FileTreeDto.Entry::path)
                    .filter(path -> path != null && path.startsWith("src/"))
                    .sorted()
                    .toList();
        } catch (RuntimeException e) {
            log.debug("Couldn't list the files of projectId: {} for suggestions", projectId, e);
            return List.of();
        }
    }
}
