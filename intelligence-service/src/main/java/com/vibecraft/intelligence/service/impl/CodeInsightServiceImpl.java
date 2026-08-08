package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.CodeChatTurn;
import com.vibecraft.intelligence.dto.code.CodeInsightResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteSelection;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.dto.code.SaveCodeNoteRequest;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.entity.CodeNote;
import com.vibecraft.intelligence.enums.UsageFeature;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.CodeInsightPrompts;
import com.vibecraft.intelligence.llm.NarrationFilter;
import com.vibecraft.intelligence.llm.tools.CodeGenerationTools;
import com.vibecraft.intelligence.mapper.CodeNoteMapper;
import com.vibecraft.intelligence.repository.CodeNoteRepository;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.service.CodeInsightService;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The code lens: explaining a selection, answering follow-ups about it, and keeping the caller's own notes.
 *
 * <p>Handles: building the prompts, checking the daily token budget before each answer, running the model with the
 * read-only file tool, streaming answers through the narration filter, recording usage with the caller captured on
 * the request thread, and the note reads and writes - each scoped to the caller as well as the project.
 *
 * <p>Read-only by construction: the only tool given here reads files, and the prompts never mention the file-writing
 * protocol. Do not add a write-capable tool, and do not inline whole files into the prompt instead of letting the
 * model read on demand - that is also what keeps a large project from flooding the context.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CodeInsightServiceImpl implements CodeInsightService {

    private static final int MAX_REPLAYED_TURNS = 20;

    private static final int MAX_LISTED_FILES = 400;

    private final ChatClient chatClient;
    private final AiUsageRecorder aiUsageRecorder;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final ProjectFileReader projectFileReader;
    private final UsageService usageService;
    private final CodeNoteRepository codeNoteRepository;
    private final CodeNoteMapper codeNoteMapper;
    private final AuthUtil authUtil;

    private CodeGenerationTools readOnlyTools(Long projectId) {
        return new CodeGenerationTools(projectFileReader, projectId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse explain(Long projectId, ExplainCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget();
        String answer = callModel(
                reservation,
                CodeInsightPrompts.explainSystemPrompt(),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                projectId,
                "code explanation");

        return new CodeInsightResponse(answer);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse ask(Long projectId, AskCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget();
        return new CodeInsightResponse(
                callModel(reservation, CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), projectId, "code question"));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamExplain(Long projectId, ExplainCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget();
        return streamModel(
                reservation,
                CodeInsightPrompts.explainSystemPrompt(),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                projectId,
                "code explanation");
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamAsk(Long projectId, AskCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget();
        return streamModel(reservation, CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), projectId, "code question");
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public List<CodeNoteResponse> getNotes(Long projectId) {
        return codeNoteMapper.fromListOfCodeNote(
                codeNoteRepository.findByProjectIdAndUserIdOrderByIdAsc(projectId, authUtil.getCurrentUserId()));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeNoteResponse saveNote(Long projectId, SaveCodeNoteRequest request) {
        Long userId = authUtil.getCurrentUserId();
        CodeNoteSelection selection = request.selection();

        CodeNote note = CodeNote.builder()
                .projectId(projectId)
                .userId(userId)
                .question(request.question().strip())
                .answer(request.answer().strip())
                .selectionPath(selection == null ? null : selection.path())
                .selectionCode(selection == null ? null : selection.code())
                .selectionStartLine(selection == null ? null : selection.startLine())
                .selectionEndLine(selection == null ? null : selection.endLine())
                .build();

        return codeNoteMapper.toCodeNoteResponse(codeNoteRepository.save(note));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void deleteNote(Long projectId, Long noteId) {
        Long userId = authUtil.getCurrentUserId();
        CodeNote note = codeNoteRepository.findByIdAndProjectIdAndUserId(noteId, projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("CodeNote", String.valueOf(noteId)));

        codeNoteRepository.delete(note);
        log.info("Deleted code note {} on projectId: {} for userId: {}", noteId, projectId, userId);
    }

    @Override
    @Transactional
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void clearNotes(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        long removed = codeNoteRepository.deleteByProjectIdAndUserId(projectId, userId);
        log.info("Cleared {} code notes on projectId: {} for userId: {}", removed, projectId, userId);
    }

    private Flux<String> streamModel(UsageReservation reservation, String systemPrompt, List<Message> messages, Long projectId, String label) {
        AtomicReference<ChatResponse> lastWithUsage = new AtomicReference<>();

        return Flux.defer(() -> {
                    NarrationFilter narration = new NarrationFilter();
                    return chatClient.prompt()
                            .system(systemPrompt)
                            .messages(messages)
                            .tools(new CodeGenerationTools(projectFileReader, projectId, narration::toolInvoked))
                            .stream()
                            .chatResponse()
                            .doOnNext(response -> {
                                if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                                    lastWithUsage.set(response);
                                }
                            })
                            .concatMapIterable(response -> {
                                if (response.getResult() == null) return List.<String>of();
                                return narration.accept(response.getResult().getOutput().getText());
                            })
                            .concatWith(Flux.defer(() -> Flux.fromIterable(narration.finish())));
                })
                .doOnComplete(() -> Mono.fromRunnable(() ->
                                aiUsageRecorder.reconcile(reservation, lastWithUsage.get(), UsageFeature.EXPLAIN, projectId))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe())
                .doOnError(error -> {
                    log.error("Streaming {} failed", label, error);
                    Mono.fromRunnable(() -> aiUsageRecorder.release(reservation)).subscribeOn(Schedulers.boundedElastic()).subscribe();
                })
                .doOnCancel(() -> Mono.fromRunnable(() -> aiUsageRecorder.release(reservation))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private List<Message> askMessages(Long projectId, AskCodeRequest request) {
        List<Message> messages = new ArrayList<>();
        messages.add(new UserMessage(fileList(projectId)));

        for (CodeChatTurn turn : recentTurns(request.history())) {
            String content = turn.content().strip();
            if (content.isEmpty()) {
                continue;
            }
            messages.add(turn.isAssistant() ? new AssistantMessage(content) : new UserMessage(content));
        }

        String selection = request.hasSelection()
                ? CodeInsightPrompts.selectionBlock(request.path(), request.startLine(), request.endLine(), request.code())
                : null;
        messages.add(new UserMessage(CodeInsightPrompts.questionBlock(selection, request.question().strip())));
        return messages;
    }

    private String fileList(Long projectId) {
        try {
            List<String> paths = workspaceServiceClient.getFileTree(projectId).entries().stream()
                    .map(FileTreeDto.Entry::path)
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

    private String callModel(UsageReservation reservation, String systemPrompt, List<Message> messages, Long projectId, String label) {
        ChatResponse response;
        try {
            response = chatClient.prompt()
                    .system(systemPrompt)
                    .messages(messages)
                    .tools(readOnlyTools(projectId))
                    .call()
                    .chatResponse();
        } catch (Exception e) {
            aiUsageRecorder.release(reservation);
            log.error("AI {} failed", label, e);
            throw new BadRequestException("Couldn't get an answer from the AI right now. Please try again.");
        }

        aiUsageRecorder.reconcile(reservation, response, UsageFeature.EXPLAIN, projectId);

        String answer = response == null || response.getResult() == null
                ? null
                : response.getResult().getOutput().getText();

        if (answer == null || answer.isBlank()) {
            log.warn("The model returned an empty {}", label);
            throw new BadRequestException("The AI didn't return an answer. Please try again.");
        }
        return answer.strip();
    }
}
