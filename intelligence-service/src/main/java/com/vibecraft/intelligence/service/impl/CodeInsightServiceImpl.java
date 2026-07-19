package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.CodeChatTurn;
import com.vibecraft.intelligence.dto.code.CodeInsightResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteSelection;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.dto.code.SaveCodeNoteRequest;
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
import com.vibecraft.intelligence.security.AuthUtil;
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
    private final WorkspaceServiceClient workspaceServiceClient;
    private final ProjectFileReader projectFileReader;
    private final UsageService usageService;
    private final CodeNoteRepository codeNoteRepository;
    private final CodeNoteMapper codeNoteMapper;
    private final AuthUtil authUtil;

    /**
     * The model's way into a file's contents. {@code CodeGenerationTools} exposes exactly one tool,
     * {@code read_files}, and nothing that writes - which is what keeps this service unable to change a
     * project even though it can now look inside one. Its prompts still never mention the
     * {@code <file>}/{@code <todo>}/{@code <learn>} protocol, so the model has no way to emit an edit here.
     * {@code ProjectFileReader} has no save/delete method at all, so this holds structurally, not just by
     * convention - see its own javadoc.
     */
    private CodeGenerationTools readOnlyTools(Long projectId) {
        return new CodeGenerationTools(projectFileReader, projectId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse explain(Long projectId, ExplainCodeRequest request) {
        // Same daily allowance as the streamed variant below. This one was ungated (in legacy-monolith too), so a
        // caller over the limit could keep spending tokens by using the non-streaming endpoint instead.
        usageService.assertWithinDailyTokenBudget();
        String answer = callModel(
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
        usageService.assertWithinDailyTokenBudget();
        return new CodeInsightResponse(
                callModel(CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), projectId, "code question"));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamExplain(Long projectId, ExplainCodeRequest request) {
        // Code notes spend real tokens too, so they come out of the same daily allowance as a build.
        usageService.assertWithinDailyTokenBudget();
        return streamModel(
                CodeInsightPrompts.explainSystemPrompt(),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                projectId,
                "code explanation");
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamAsk(Long projectId, AskCodeRequest request) {
        usageService.assertWithinDailyTokenBudget();
        return streamModel(CodeInsightPrompts.askSystemPrompt(), askMessages(projectId, request), projectId, "code question");
    }

    // --- Saved notes --------------------------------------------------------------------------------
    //
    // Scoped to the caller on every call. `canViewProject` says whether they may look at this project at
    // all; the user id from the JWT is what keeps one member out of another's thread within it.

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

        // Plain ids, not loads: @PreAuthorize has already established the caller is a member of this
        // project, and CodeNote carries projectId/userId as plain columns now (Project/User live in other
        // services' databases) - nothing left to reference.
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

        // Gone for good - these are personal notes, so there is nothing to soft-delete them for.
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

    /**
     * Streams the reply, recording usage from the trailing chunk the way the chat pipeline does.
     *
     * <p>Wrapped in {@code Flux.defer} for the same reason the generation pipeline is: Spring AI's advisor
     * chain is single-use per subscription, so a resubscribe (a retry, or two subscribers) must rebuild the
     * whole call rather than walking a spent chain.
     */
    private Flux<String> streamModel(String systemPrompt, List<Message> messages, Long projectId, String label) {
        AtomicReference<ChatResponse> lastWithUsage = new AtomicReference<>();
        // Captured here, on the request thread. doOnComplete below runs on a Reactor thread with no signed-in
        // user: reading the caller there threw, the recorder swallowed it, and ExplainLLM answers were never
        // billed or counted.
        Long userId = authUtil.getCurrentUserId();

        return Flux.defer(() -> {
                    // Per subscription, like the advisor chain: a retry starts with nothing held.
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
                                // The trailing usage chunk carries no choices at all, so there's nothing to emit for it.
                                if (response.getResult() == null) return List.<String>of();
                                return narration.accept(response.getResult().getOutput().getText());
                            })
                            .concatWith(Flux.defer(() -> Flux.fromIterable(narration.finish())));
                })
                // Unlike AiGenerationServiceImpl's finalizeChats, nothing hands this off to boundedElastic on its
                // own - doOnComplete would otherwise run recordTokenUsage's two blocking JPA writes directly on
                // the Netty/WebClient completion thread. Found while porting this class: recordTokenUsage is a
                // pre-existing blocking call on that thread even before this migration, worth fixing while every
                // line around it is already being touched.
                .doOnComplete(() -> Mono.fromRunnable(() ->
                                aiUsageRecorder.record(lastWithUsage.get(), UsageFeature.EXPLAIN, userId, projectId))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe())
                .doOnError(error -> log.error("Streaming {} failed", label, error));
    }

    /**
     * The file list leads, then the replayed conversation, then the question with its selected code quoted
     * inside it.
     *
     * <p>The selection deliberately rides on the question rather than sitting in a message of its own near
     * the top: with history replayed in between, a model asked "what is this code?" answered that it had no
     * selection, because by the time it read the question the block was several messages back.
     */
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

    /**
     * The project's layout, as paths straight from the database. Contents aren't inlined here - the model
     * reads the few files a question actually needs through {@code read_files} instead, which keeps a large
     * project from flooding the prompt. A failed lookup still answers, just without the layout.
     */
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

    /**
     * Unlike the idea clarifier, a failure here has no sensible non-AI fallback - there's no useful explanation
     * to synthesise without a model - so this surfaces the failure instead of inventing an answer.
     */
    private String callModel(String systemPrompt, List<Message> messages, Long projectId, String label) {
        try {
            ChatResponse response = chatClient.prompt()
                    .system(systemPrompt)
                    .messages(messages)
                    .tools(readOnlyTools(projectId))
                    .call()
                    .chatResponse();

            aiUsageRecorder.record(response, UsageFeature.EXPLAIN, projectId);

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
