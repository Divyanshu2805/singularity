package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.code.AskCodeRequest;
import com.java.vibecraft.dto.code.CodeChatTurn;
import com.java.vibecraft.dto.code.CodeInsightResponse;
import com.java.vibecraft.dto.code.ExplainCodeRequest;
import com.java.vibecraft.entity.ProjectFile;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.llm.AiUsageRecorder;
import com.java.vibecraft.llm.CodeInsightPrompts;
import com.java.vibecraft.repository.ProjectFileRepository;
import com.java.vibecraft.service.CodeInsightService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

@Service
@RequiredArgsConstructor
@Slf4j
public class CodeInsightServiceImpl implements CodeInsightService {

    /** How much of the conversation is replayed. Older turns fall off the front, keeping the newest context. */
    private static final int MAX_REPLAYED_TURNS = 20;

    /** Enough for any real Vite app; a runaway project still can't blow up the prompt. */
    private static final int MAX_LISTED_FILES = 400;

    private final ChatClient chatClient;
    private final AiUsageRecorder aiUsageRecorder;
    private final ProjectFileRepository projectFileRepository;

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse explain(Long projectId, ExplainCodeRequest request) {
        String answer = callModel(
                CodeInsightPrompts.explainSystemPrompt(),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                "code explanation");

        return new CodeInsightResponse(answer);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse ask(Long projectId, AskCodeRequest request) {
        return new CodeInsightResponse(
                callModel(CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), "code question"));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamExplain(Long projectId, ExplainCodeRequest request) {
        return streamModel(
                CodeInsightPrompts.explainSystemPrompt(),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                "code explanation");
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamAsk(Long projectId, AskCodeRequest request) {
        return streamModel(CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), "code question");
    }

    /**
     * Streams the reply, recording usage from the trailing chunk the way the chat pipeline does.
     *
     * <p>Wrapped in {@code Flux.defer} for the same reason the generation pipeline is: Spring AI's advisor
     * chain is single-use per subscription, so a resubscribe (a retry, or two subscribers) must rebuild the
     * whole call rather than walking a spent chain.
     */
    private Flux<String> streamModel(String systemPrompt, List<Message> messages, String label) {
        AtomicReference<ChatResponse> lastWithUsage = new AtomicReference<>();

        return Flux.defer(() -> chatClient.prompt()
                        .system(systemPrompt)
                        .messages(messages)
                        .stream()
                        .chatResponse())
                .doOnNext(response -> {
                    if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                        lastWithUsage.set(response);
                    }
                })
                .mapNotNull(response -> {
                    // The trailing usage chunk carries no choices at all, so there's nothing to emit for it.
                    if (response.getResult() == null) return null;
                    String text = response.getResult().getOutput().getText();
                    return text == null ? "" : text;
                })
                .doOnComplete(() -> aiUsageRecorder.record(lastWithUsage.get(), label))
                .doOnError(error -> log.error("Streaming {} failed", label, error));
    }

    /**
     * The file list leads, then the selection if there is one, then the replayed conversation, then the new
     * question. Leading with both keeps every turn anchored even once older history is trimmed.
     */
    private List<Message> askMessages(Long projectId, AskCodeRequest request) {
        List<Message> messages = new ArrayList<>();
        messages.add(new UserMessage(fileList(projectId)));
        if (request.hasSelection()) {
            messages.add(new UserMessage(CodeInsightPrompts.selectionBlock(
                    request.path(), request.startLine(), request.endLine(), request.code())));
        }

        for (CodeChatTurn turn : recentTurns(request.history())) {
            String content = turn.content().strip();
            if (content.isEmpty()) {
                continue;
            }
            messages.add(turn.isAssistant() ? new AssistantMessage(content) : new UserMessage(content));
        }

        messages.add(new UserMessage(request.question().strip()));
        return messages;
    }

    /**
     * Paths only, straight from the database - never file contents, and never through
     * {@code ProjectFileService}, which can write. That keeps this service unable to change a project.
     * A failed lookup still answers, just without the layout.
     */
    private String fileList(Long projectId) {
        try {
            List<String> paths = projectFileRepository.findByProjectId(projectId).stream()
                    .map(ProjectFile::getPath)
                    .filter(path -> path != null && !path.isBlank())
                    .sorted()
                    .toList();
            return CodeInsightPrompts.fileListBlock(
                    paths.subList(0, Math.min(paths.size(), MAX_LISTED_FILES)), paths.size());
        } catch (Exception e) {
            log.warn("Couldn't list files for code notes on projectId: {}", projectId, e);
            return "The project's file list isn't available right now.";
        }
    }

    private List<CodeChatTurn> recentTurns(List<CodeChatTurn> history) {
        if (history == null || history.isEmpty()) {
            return List.of();
        }
        int from = Math.max(0, history.size() - MAX_REPLAYED_TURNS);
        return history.subList(from, history.size());
    }

    /**
     * Unlike the idea clarifier, a failure here has no sensible non-AI fallback - there's no useful explanation
     * to synthesise without a model - so this surfaces the failure instead of inventing an answer.
     */
    private String callModel(String systemPrompt, List<Message> messages, String label) {
        try {
            ChatResponse response = chatClient.prompt()
                    .system(systemPrompt)
                    .messages(messages)
                    .call()
                    .chatResponse();

            aiUsageRecorder.record(response, label);

            String answer = response == null || response.getResult() == null
                    ? null
                    : response.getResult().getOutput().getText();

            if (answer == null || answer.isBlank()) {
                log.warn("The model returned an empty {}", label);
                throw new BadRequestException("The AI didn't return an answer. Please try again.");
            }
            return answer.strip();
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            log.error("AI {} failed", label, e);
            throw new BadRequestException("Couldn't get an answer from the AI right now. Please try again.");
        }
    }
}
