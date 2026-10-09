package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.dto.code.AskCodeRequest;
import com.singularity.intelligence.dto.code.CodeChatTurn;
import com.singularity.intelligence.dto.code.CodeInsightResponse;
import com.singularity.intelligence.dto.code.CodeNoteResponse;
import com.singularity.intelligence.dto.code.CodeNoteSelection;
import com.singularity.intelligence.dto.code.ExplainCodeRequest;
import com.singularity.intelligence.dto.code.GlossaryEntryResponse;
import com.singularity.intelligence.dto.code.GlossaryRequest;
import com.singularity.intelligence.dto.code.LessonRequest;
import com.singularity.intelligence.dto.code.OverviewRequest;
import com.singularity.intelligence.dto.code.SaveCodeNoteRequest;
import com.singularity.intelligence.dto.code.TaskCheckRequest;
import com.singularity.intelligence.dto.code.TaskRequest;
import com.singularity.intelligence.dto.code.TourRequest;
import com.singularity.intelligence.dto.code.TourResponse;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.CodeNote;
import com.singularity.intelligence.entity.GlossaryEntry;
import com.singularity.intelligence.entity.ProjectTour;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ChangedLines;
import com.singularity.intelligence.llm.CodeInsightPrompts;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.NarrationFilter;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import com.singularity.intelligence.mapper.CodeNoteMapper;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.CodeNoteRepository;
import com.singularity.intelligence.repository.GlossaryEntryRepository;
import com.singularity.intelligence.repository.ProjectTourRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.service.CodeInsightService;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
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
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The code lens: explaining a selection, answering follow-ups about it, and keeping the caller's own notes.
 *
 * <p>Handles: building the prompts, checking the daily token budget before each answer, running the model with the
 * read-only file tool, streaming answers through the narration filter, recording usage with the caller captured on
 * the request thread, the note reads and writes - each scoped to the caller as well as the project - and teaching
 * mode's two texts about a saved turn: the big picture of the whole turn, and the lesson on one of its steps.
 *
 * <p>Read-only by construction: the only tool given here reads files (a step lesson is given none), and the prompts
 * never mention the file-writing protocol. Do not add a write-capable tool, and do not inline whole files into the
 * prompt instead of letting the model read on demand - that is also what keeps a large project from flooding the
 * context. A step lesson is the one bounded exception: it is given the lines one step changed in one file.
 *
 * <p>A step lesson is written from the caller's own saved conversation, and the browser names only which step. The
 * file edit is found by its id, the project and the caller together; its turn must have been asked for in teaching
 * mode; what it changed is the difference between the version the turn saved and the one it replaced, both of which
 * the edit carries. The finished lesson is kept on the edit, so it is written and paid for once: opening the step
 * again, in this session or any later one, returns the kept text without calling the model or touching the budget.
 * A lesson whose stream was cut short is not kept, since half a lesson would then be the lesson for good. Two
 * requests for the same step at the same moment both write one; the first to finish is the one kept.
 *
 * <p>A turn's big picture follows the same rules one level up. The browser names only the saved reply; it is found
 * by its id, the project and the caller together and must have been asked for in teaching mode. The model is given
 * the request, what the build said, its steps and the paths of the files it wrote - no file text - and reads what it
 * needs through the read tool, so nothing here widens the one exception above. It is kept on the reply once
 * finished and returned from there afterwards.
 *
 * <p>The tour, the glossary and the "try changing this" task are the same idea for what belongs to the person rather
 * than to a turn, and each is asked for by name and by nothing else the browser could vary. The tour is read from the
 * project itself by the read tool and kept per project and person; asking again returns the kept text, and only an
 * explicit rewrite calls the model, replacing it once the new one has finished. A glossary term is cut to one line
 * and 80 characters, reaches the model only as a user message, is kept per project, person and lower-cased term, and
 * is not kept when the model says it is not a programming word; a glossary holds at most 200 terms. A task is set
 * from the same changed lines a lesson is written from and kept on the file edit; checking it gives the model the
 * task and the path and nothing of the file, which it reads through the tool as it is saved now, and a first line of
 * "Done" marks the task done for good. All of it is bound to the caller's own saved step or own rows.
 *
 * <p>Every answer is written for the reader's own level, which the request carries as one of three fixed values and
 * which only chooses a paragraph of the prompt. A kept lesson or overview stays as it was first written, whatever
 * level it is asked for at later.
 *
 * <p>An answer the reader stops watching is charged for what had been written by then, not released: see
 * AiUsageRecorder. A call is settled once, by whichever of its endings comes first. That is not a formality: when a
 * stream finishes, the servlet container closes the response and Spring cancels the subscription it has just seen
 * complete, so a cancel follows every ordinary ending - and for a while every lesson, explanation and big picture was
 * charged twice, once as finished and once as abandoned. One real lesson, read in the usage log, showed it.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CodeInsightServiceImpl implements CodeInsightService {

    private static final int MAX_REPLAYED_TURNS = 20;

    private static final int MAX_LISTED_FILES = 400;

    private static final int MAX_GLOSSARY_TERMS = 200;

    private final ChatClient chatClient;
    private final ModelCalls modelCalls;
    private final AiUsageRecorder aiUsageRecorder;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final ProjectFileReader projectFileReader;
    private final UsageService usageService;
    private final CodeNoteRepository codeNoteRepository;
    private final ChatEventRepository chatEventRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final CodeNoteMapper codeNoteMapper;
    private final AuthUtil authUtil;
    private final ProjectTourRepository projectTourRepository;
    private final GlossaryEntryRepository glossaryEntryRepository;

    private CodeGenerationTools readOnlyTools(Long projectId) {
        return new CodeGenerationTools(projectFileReader, projectId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse explain(Long projectId, ExplainCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        String answer = callModel(
                reservation,
                CodeInsightPrompts.explainSystemPrompt(request.level()),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                projectId,
                "code explanation");

        return new CodeInsightResponse(answer);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeInsightResponse ask(Long projectId, AskCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        return new CodeInsightResponse(
                callModel(reservation, CodeInsightPrompts.askSystemPrompt(request.level()), askMessages(projectId, request), projectId, "code question"));
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamExplain(Long projectId, ExplainCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        return streamModel(
                reservation,
                CodeInsightPrompts.explainSystemPrompt(request.level()),
                List.of(new UserMessage(CodeInsightPrompts.selectionBlock(
                        request.path(), request.startLine(), request.endLine(), request.code()))),
                projectId,
                "code explanation",
                true,
                AiCallKind.EXPLAIN);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamAsk(Long projectId, AskCodeRequest request) {
        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        return streamModel(reservation, CodeInsightPrompts.askSystemPrompt(request.level()), askMessages(projectId, request), projectId, "code question", true, AiCallKind.EXPLAIN);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamLesson(Long projectId, LessonRequest request) {
        Long userId = authUtil.getCurrentUserId();
        ChatEvent edit = chatEventRepository.findOwnFileEdit(request.eventId(), projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Build step", String.valueOf(request.eventId())));
        ChatMessage turn = edit.getChatMessage();
        if (!turn.isTeaching()) {
            throw new BadRequestException("This step wasn't built in teaching mode, so it has no lesson.");
        }
        if (edit.getLesson() != null && !edit.getLesson().isBlank()) {
            return Flux.just(edit.getLesson());
        }

        String change = changeBlock(projectId, userId, turn, edit);

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        Long eventId = edit.getId();
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.lessonSystemPrompt(request.level()),
                List.of(new UserMessage(change)),
                projectId,
                "step lesson",
                false,
                AiCallKind.LESSON)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepLesson(eventId, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private String changeBlock(Long projectId, Long userId, ChatMessage turn, ChatEvent edit) {
        String asked = chatMessageRepository.findRequestsBefore(projectId, userId, turn.getId(), PageRequest.of(0, 1))
                .stream().findFirst().orElse(null);
        List<CodeInsightPrompts.LessonStep> steps = chatEventRepository.findSteps(turn.getId()).stream()
                .filter(step -> step.getContent() != null && !step.getContent().isBlank())
                .map(step -> new CodeInsightPrompts.LessonStep(step.getContent(), step.getFilePath()))
                .toList();
        return CodeInsightPrompts.lessonBlock(
                asked, steps, edit.getFilePath(), edit.getPreviousContent(), edit.getContent());
    }

    private ChatEvent ownTeachingEdit(Long projectId, Long userId, Long eventId, String what) {
        ChatEvent edit = chatEventRepository.findOwnFileEdit(eventId, projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Build step", String.valueOf(eventId)));
        if (!edit.getChatMessage().isTeaching()) {
            throw new BadRequestException("This step wasn't built in teaching mode, so it has no " + what + ".");
        }
        return edit;
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamTask(Long projectId, TaskRequest request) {
        Long userId = authUtil.getCurrentUserId();
        ChatEvent edit = ownTeachingEdit(projectId, userId, request.eventId(), "task");
        if (edit.getTask() != null && !edit.getTask().isBlank()) {
            return Flux.just(edit.getTask());
        }
        if (edit.getContent() == null || edit.getContent().isBlank()) {
            throw new BadRequestException("This step didn't leave anything to change, so there is no task to set.");
        }
        String change = changeBlock(projectId, userId, edit.getChatMessage(), edit);

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        Long eventId = edit.getId();
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.taskSystemPrompt(request.level()),
                List.of(new UserMessage(change)),
                projectId,
                "step task",
                false,
                AiCallKind.LESSON)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepTask(eventId, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamTaskCheck(Long projectId, TaskCheckRequest request) {
        Long userId = authUtil.getCurrentUserId();
        ChatEvent edit = ownTeachingEdit(projectId, userId, request.eventId(), "task");
        if (edit.getTask() == null || edit.getTask().isBlank()) {
            throw new BadRequestException("This step has no task yet. Ask for one first.");
        }
        if (edit.isTaskDone()) {
            return Flux.just("Done\n\nYou already made this change, so this task is marked as done.");
        }

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        Long eventId = edit.getId();
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.taskCheckSystemPrompt(request.level()),
                List.of(new UserMessage(CodeInsightPrompts.taskCheckBlock(edit.getFilePath(), edit.getTask()))),
                projectId,
                "task check",
                true,
                AiCallKind.EXPLAIN)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepTaskResult(eventId, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private void keepTask(Long eventId, String task) {
        if (task.isBlank()) {
            return;
        }
        try {
            chatEventRepository.saveTask(eventId, task.strip());
        } catch (Exception e) {
            log.warn("Couldn't keep the task written for chat event {}", eventId, e);
        }
    }

    private void keepTaskResult(Long eventId, String check) {
        if (!CodeInsightPrompts.isDoneVerdict(check)) {
            return;
        }
        try {
            chatEventRepository.markTaskDone(eventId);
        } catch (Exception e) {
            log.warn("Couldn't mark the task of chat event {} as done", eventId, e);
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public TourResponse getTour(Long projectId) {
        return projectTourRepository.findByProjectIdAndUserId(projectId, authUtil.getCurrentUserId())
                .map(tour -> new TourResponse(tour.getContent(), tour.getUpdatedAt()))
                .orElse(null);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamTour(Long projectId, TourRequest request) {
        Long userId = authUtil.getCurrentUserId();
        if (!request.rewrite()) {
            ProjectTour kept = projectTourRepository.findByProjectIdAndUserId(projectId, userId).orElse(null);
            if (kept != null && !kept.getContent().isBlank()) {
                return Flux.just(kept.getContent());
            }
        }

        List<String> paths;
        try {
            paths = projectPaths(projectId);
        } catch (Exception e) {
            log.warn("Couldn't list files for the tour of projectId: {}", projectId, e);
            throw new BadRequestException("Couldn't read this project's files right now. Please try again.");
        }
        if (paths.isEmpty()) {
            throw new BadRequestException("This project has no files yet, so there is nothing to tour.");
        }

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.tourSystemPrompt(request.level()),
                List.of(new UserMessage(CodeInsightPrompts.fileListBlock(
                        paths.subList(0, Math.min(paths.size(), MAX_LISTED_FILES)), paths.size()))),
                projectId,
                "project tour",
                true,
                AiCallKind.LESSON)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepTour(projectId, userId, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private void keepTour(Long projectId, Long userId, String tour) {
        if (tour.isBlank()) {
            return;
        }
        try {
            projectTourRepository.keep(projectId, userId, tour.strip());
        } catch (Exception e) {
            log.warn("Couldn't keep the tour written for projectId: {}", projectId, e);
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public List<GlossaryEntryResponse> getGlossary(Long projectId) {
        return glossaryEntryRepository.findByProjectIdAndUserIdOrderByTermKeyAsc(projectId, authUtil.getCurrentUserId())
                .stream()
                .map(entry -> new GlossaryEntryResponse(
                        entry.getId(), entry.getTerm(), entry.getDefinition(), entry.getCreatedAt()))
                .toList();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamTerm(Long projectId, GlossaryRequest request) {
        Long userId = authUtil.getCurrentUserId();
        String term = CodeInsightPrompts.cleanTerm(request.term());
        if (term.isEmpty()) {
            throw new BadRequestException("Type the word you want defined.");
        }
        String key = CodeInsightPrompts.termKey(term);
        GlossaryEntry kept = glossaryEntryRepository.findByProjectIdAndUserIdAndTermKey(projectId, userId, key).orElse(null);
        if (kept != null) {
            return Flux.just(kept.getDefinition());
        }
        if (glossaryEntryRepository.countByProjectIdAndUserId(projectId, userId) >= MAX_GLOSSARY_TERMS) {
            throw new BadRequestException("Your glossary for this project is full (" + MAX_GLOSSARY_TERMS
                    + " words). Remove some to add more.");
        }

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.glossarySystemPrompt(request.level()),
                List.of(new UserMessage(fileList(projectId)), new UserMessage(CodeInsightPrompts.termBlock(term))),
                projectId,
                "glossary entry",
                true,
                AiCallKind.LESSON)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepTerm(projectId, userId, term, key, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private void keepTerm(Long projectId, Long userId, String term, String key, String definition) {
        if (definition.isBlank() || CodeInsightPrompts.isNotATerm(definition)) {
            return;
        }
        try {
            glossaryEntryRepository.keep(projectId, userId, term, key, definition.strip());
        } catch (Exception e) {
            log.warn("Couldn't keep the glossary entry written for projectId: {}", projectId, e);
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void deleteTerm(Long projectId, Long entryId) {
        Long userId = authUtil.getCurrentUserId();
        GlossaryEntry entry = glossaryEntryRepository.findByIdAndProjectIdAndUserId(entryId, projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("GlossaryEntry", String.valueOf(entryId)));
        glossaryEntryRepository.delete(entry);
        log.info("Removed glossary entry {} on projectId: {} for userId: {}", entryId, projectId, userId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Flux<String> streamOverview(Long projectId, OverviewRequest request) {
        Long userId = authUtil.getCurrentUserId();
        ChatMessage turn = chatMessageRepository.findOwnReply(request.messageId(), projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Build turn", String.valueOf(request.messageId())));
        if (!turn.isTeaching()) {
            throw new BadRequestException("This turn wasn't built in teaching mode, so it has no overview.");
        }
        if (turn.getOverview() != null && !turn.getOverview().isBlank()) {
            return Flux.just(turn.getOverview());
        }

        List<ChatEvent> events = chatEventRepository.findWrittenAndSaid(turn.getId());
        List<CodeInsightPrompts.OverviewFile> files = writtenFiles(events);
        if (files.isEmpty()) {
            throw new BadRequestException("This turn didn't write any files, so there is nothing to give an overview of.");
        }
        String asked = chatMessageRepository.findRequestsBefore(projectId, userId, turn.getId(), PageRequest.of(0, 1))
                .stream().findFirst().orElse(null);
        String said = events.stream()
                .filter(event -> event.getType() == ChatEventType.MESSAGE)
                .map(ChatEvent::getContent)
                .filter(content -> content != null && !content.isBlank())
                .map(String::strip)
                .collect(Collectors.joining("\n"));
        List<CodeInsightPrompts.LessonStep> steps = chatEventRepository.findSteps(turn.getId()).stream()
                .filter(step -> step.getContent() != null && !step.getContent().isBlank())
                .map(step -> new CodeInsightPrompts.LessonStep(step.getContent(), step.getFilePath()))
                .toList();

        UsageReservation reservation = usageService.reserveBudget(UsageFeature.EXPLAIN);
        Long messageId = turn.getId();
        StringBuilder written = new StringBuilder();
        return streamModel(
                reservation,
                CodeInsightPrompts.overviewSystemPrompt(request.level()),
                List.of(new UserMessage(CodeInsightPrompts.overviewBlock(asked, said, steps, files))),
                projectId,
                "turn overview",
                true,
                AiCallKind.LESSON)
                .doOnNext(written::append)
                .doOnComplete(() -> Mono.fromRunnable(() -> keepOverview(messageId, written.toString()))
                        .subscribeOn(Schedulers.boundedElastic())
                        .subscribe());
    }

    private List<CodeInsightPrompts.OverviewFile> writtenFiles(List<ChatEvent> events) {
        Map<String, CodeInsightPrompts.OverviewFile> files = new LinkedHashMap<>();
        for (ChatEvent event : events) {
            String path = event.getFilePath();
            if (path == null || path.isBlank()) {
                continue;
            }
            if (event.getType() == ChatEventType.FILE_DELETE) {
                files.put(path, new CodeInsightPrompts.OverviewFile(path, false, true, 0));
            } else if (event.getType() == ChatEventType.FILE_EDIT) {
                boolean created = event.getPreviousContent() == null || event.getPreviousContent().isBlank();
                files.put(path, new CodeInsightPrompts.OverviewFile(
                        path, created, false, ChangedLines.linesOf(event.getContent()).size()));
            }
        }
        return List.copyOf(files.values());
    }

    private void keepOverview(Long messageId, String overview) {
        if (overview.isBlank()) {
            return;
        }
        try {
            chatMessageRepository.saveOverview(messageId, overview.strip());
        } catch (Exception e) {
            log.warn("Couldn't keep the overview written for chat message {}", messageId, e);
        }
    }

    private void keepLesson(Long eventId, String lesson) {
        if (lesson.isBlank()) {
            return;
        }
        try {
            chatEventRepository.saveLesson(eventId, lesson.strip());
        } catch (Exception e) {
            log.warn("Couldn't keep the lesson written for chat event {}", eventId, e);
        }
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

    private Flux<String> streamModel(UsageReservation reservation, String systemPrompt, List<Message> messages, Long projectId,
                                     String label, boolean readsFiles, AiCallKind kind) {
        AtomicReference<ChatResponse> lastWithUsage = new AtomicReference<>();
        AtomicInteger written = new AtomicInteger();
        AtomicBoolean settled = new AtomicBoolean();
        int promptChars = systemPrompt.length()
                + messages.stream().mapToInt(message -> message.getText() == null ? 0 : message.getText().length()).sum();

        return Flux.defer(() -> {
                    NarrationFilter narration = new NarrationFilter();
                    ChatClient.ChatClientRequestSpec call = modelCalls.apply(chatClient.prompt(), kind)
                            .system(systemPrompt)
                            .messages(messages);
                    if (readsFiles) {
                        call = call.tools(new CodeGenerationTools(projectFileReader, projectId, narration::toolInvoked));
                    }
                    return call.stream()
                            .chatResponse()
                            .doOnNext(response -> {
                                if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                                    lastWithUsage.set(response);
                                }
                            })
                            .concatMapIterable(response -> {
                                if (response.getResult() == null) return List.<String>of();
                                String text = response.getResult().getOutput().getText();
                                written.addAndGet(text == null ? 0 : text.length());
                                return narration.accept(text);
                            })
                            .concatWith(Flux.defer(() -> Flux.fromIterable(narration.finish())));
                })
                .doOnComplete(() -> {
                    if (!settled.compareAndSet(false, true)) return;
                    Mono.fromRunnable(() ->
                                    aiUsageRecorder.reconcile(reservation, lastWithUsage.get(), UsageFeature.EXPLAIN, projectId))
                            .subscribeOn(Schedulers.boundedElastic())
                            .subscribe();
                })
                .doOnError(error -> {
                    log.error("Streaming {} failed", label, error);
                    if (!settled.compareAndSet(false, true)) return;
                    Mono.fromRunnable(() -> aiUsageRecorder.release(reservation)).subscribeOn(Schedulers.boundedElastic()).subscribe();
                })
                .doOnCancel(() -> {
                    if (!settled.compareAndSet(false, true)) return;
                    Mono.fromRunnable(() -> aiUsageRecorder.reconcileUnfinished(reservation,
                                    usageOf(lastWithUsage.get()), UsageFeature.EXPLAIN, projectId, promptChars, written.get()))
                            .subscribeOn(Schedulers.boundedElastic())
                            .subscribe();
                });
    }

    private static Usage usageOf(ChatResponse response) {
        return response == null || response.getMetadata() == null ? null : response.getMetadata().getUsage();
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

    private List<String> projectPaths(Long projectId) {
        return workspaceServiceClient.getFileTree(projectId).entries().stream()
                .map(FileTreeDto.Entry::path)
                .filter(path -> path != null && !path.isBlank())
                .sorted()
                .toList();
    }

    private String fileList(Long projectId) {
        try {
            List<String> paths = projectPaths(projectId);
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
            response = modelCalls.apply(chatClient.prompt(), AiCallKind.EXPLAIN)
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
