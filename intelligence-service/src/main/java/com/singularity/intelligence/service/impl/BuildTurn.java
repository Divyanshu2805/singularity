package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.BuildModel;
import com.singularity.intelligence.llm.FileEdits;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedTurn;
import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.ProjectImports;
import com.singularity.intelligence.llm.PromptUtils;
import com.singularity.intelligence.llm.StrayBackslashes;
import com.singularity.intelligence.llm.SyntaxCheck;
import com.singularity.intelligence.llm.TurnReview;
import com.singularity.intelligence.llm.TurnReview.Kind;
import com.singularity.intelligence.llm.TurnReview.Review;
import com.singularity.intelligence.llm.TurnReview.TypeProblem;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import com.singularity.intelligence.service.CodeChecker;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.Disposable;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;

/**
 * Runs one build turn from the model's first word to the saved result.
 *
 * <p>Handles: calling the model and streaming what it writes to whoever is watching; carrying on a reply that stopped
 * before it wrote everything it planned, or that was cut off mid-file; trying again when nothing came back or the
 * provider was briefly busy; applying its changes to parts of files; checking that the files it leaves parse and
 * only import things that will exist, and asking the model to repair what does not; settling the turn's token usage;
 * and handing the outcome to be saved, whatever it was - finished, unfinished, empty, failed or stopped.
 *
 * <p>It is one blocking loop on its own thread on purpose. The earlier pipeline was a chain of stream callbacks: the
 * viewer's stream ended when the model stopped writing, the answer was parsed and saved afterwards on a borrowed
 * thread, and a second, hidden model call was made from inside that save with nothing bounding it. That call once
 * stalled forever, which left the project registered as "generating" until the service was restarted. Here every wait
 * has a limit - silence on the model's stream, one call, the whole turn - and the registry entry is removed on every
 * path out, including the ones that throw.
 *
 * <p>The project is described to the model once, at the start of the turn, and that one description goes with every
 * call: the first, a reply being carried on, a repair, a second ask. A later call is sent without the earlier call's
 * tool results, so anything the model had only read through its tool is gone by then - which is how a second attempt
 * once rewrote a stylesheet from memory and dropped the line that loaded the component library.
 *
 * <p>That description grows by one thing during a turn: a file the model read through its tool is added to it for
 * every later call ({@code ProjectBrief.withRead}), for the same reason - a later call has nothing the earlier one
 * read. A project too large to show whole used to lose exactly those files between a reply and its repair.
 *
 * <p>Each call logs how long the model took to write its first word and to finish. A build once sat on "Thinking it
 * through" for most of a minute with nothing in the log to say whether the wait was the model's or ours.
 *
 * <p>The turn says what it is doing from its first moment - reading the project, then thinking - so the person who
 * pressed send sees something happen at once, not a blank reply for the seconds a model takes to begin writing.
 *
 * <p>The request goes to the model with the shape of a reply written out beneath it ({@code PromptUtils.replyShape}).
 * The request is the last thing the model reads, after the prompt and the project's files, and what it reads last is
 * what it follows. Only the model sees that addition: the turn is recorded, and replayed as history, with the
 * person's own words.
 *
 * <p>A reply that needs more is continued, not repeated: the model is given what it already wrote and asked for the
 * rest (see {@link TurnReview}). The text watchers hold is corrected first, so a half-written file or a premature
 * "done" never sits in the middle of the finished answer. Only a turn with nothing usable at all is sent again from
 * the start, once. What the model is given back is its own writing only: the notes that files were read are written
 * into the text by the server, and a model shown them as its own words starts writing them itself.
 *
 * <p>A model that answers in plain words, with none of the protocol's tags, has still answered. It is asked once more
 * like any reply with nothing usable in it, because the second attempt usually does the work the first only talked
 * about - but it is shown its reply and told what was wrong with it, not sent the same request again: the model runs
 * at temperature zero, so an identical request would get the identical answer. If the second reply is plain words
 * too, they are kept as the answer rather than reported as no answer at all. Text that looks like files written
 * outside the protocol is not kept that way - it would be a wall of code in the chat.
 *
 * <p>The same goes for a model that tags its steps and files correctly but writes its plan and its summary as plain
 * sentences around them, which one real model does every time it has just used the read tool. The work is done and
 * saved either way, but the person would be shown a checklist and no words. When a turn holds no message at all, the
 * plain text before its first step and after its last is kept as its opening and closing message; text in between
 * ("here are the changes:") is filler and stays out. The opening words are looked for after the model's working-out,
 * which comes first in a reply and is not a step.
 *
 * <p>A reply that only thought - its working-out and then nothing - is an answer to nobody. It is asked for
 * once more like any reply with nothing usable in it, and like a reply in plain words it is shown back with a note
 * saying what was missing, since the same request at temperature zero would only think the same thoughts again.
 *
 * <p>A rate-limited provider is waited for only when the failed call produced nothing. If it had already written
 * something, running it again would write that a second time, so it is treated like any reply that stopped early.
 *
 * <p>Usage is settled per call, against the hold on the daily allowance taken before the turn began, which the turn
 * keeps until it ends. Each call is charged what the provider reports; one that ended without a usage report -
 * stopped, timed out, failed, cut off - is charged an estimate of what was sent and what it wrote, which is closer to
 * the truth than recording nothing. The first call is recorded as the build and each later one as a retry.
 *
 * <p>The allowance is watched while a call runs, not only before the turn. A turn admitted with a little allowance
 * left used to run to the end whatever it cost, and a long one finished thousands of tokens past the daily limit. As
 * the answer streams, the call's estimated spend - the prompt, plus what has been written so far - is reported to the
 * usage service, which is also what lets the meter rise while a reply is written. When that says the allowance is
 * gone, the call is ended there and the turn is closed as out of budget: the files it had finished are saved, since
 * they were paid for, the half-written one is dropped, and a note says how far it got. No further call - a
 * continuation, a second ask, an import repair - is started once there is not room for one.
 *
 * <p>Whatever is handed over to be saved has one known artifact taken out of it first: a backslash a model leaves at
 * the end of a line of code when it rewrites a long file ({@link StrayBackslashes}). Two of those, in two files of one
 * turn, were enough to stop a project compiling.
 *
 * <p>A change to part of a file ({@code <edit>}) is applied before anything is checked or saved ({@link FileEdits}),
 * against the file as the answer has left it so far and otherwise as it is stored. What is checked, and what is
 * saved, is always the whole file that results. One whose text could not be found in the file is not applied at
 * all: the model is told, with the change taken back out of the text watchers hold so the corrected one does not
 * sit beside it, and if it still cannot be applied the file is left as it was and a note says so.
 *
 * <p>The written files are then parsed ({@link SyntaxCheck}) and their imports resolved, and whatever either finds
 * goes back to the model in the same request as any edit that failed - one further call for all of it, a few times
 * at most ({@code generation.max-repairs}). The parse is of the files as they will be saved, with the stray backslashes already out, so the model is
 * never asked to repair something the save would have mended anyway. A problem that survives the repairs is saved
 * with a note naming it: the person is better served by the rest of the turn and a plain warning than by nothing.
 * When an edit is sent back, the reply's closing words go with it - a "that is done" written before the check would
 * otherwise sit above the repair - and the repair call's read tool ends its answers with a note written for a reply
 * being finished, not the one that restates a whole reply's order, which had a model start its reply over.
 *
 * <p>Files that pass those are then handed to a compiler ({@link CodeChecker}), which type-checks them in the
 * project's running preview, where its packages are installed, and looks up any package the turn adds. That finds
 * what reading the text cannot - a prop a component does not take, a package that does not exist - and goes back
 * to the model the same way. It is only asked once the cheaper checks pass, since a file that does not parse has
 * nothing to tell a compiler, and it is asked again after each repair, because the repair is new code. With no
 * preview running there is nothing to check against, and the turn is saved on the static checks alone.
 *
 * <p>Stopping a turn saves none of its files, even ones that had finished arriving: half a feature is usually a
 * broken project. What had been said is still recorded - the message it was in the middle of included - with a note,
 * so the turn is in the conversation after a refresh. A turn the server itself abandons because it is shutting down
 * ends the same way, but is recorded as failed and says the server restarted: it was not the person's doing, and
 * they are owed a Retry rather than "you stopped this".
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class BuildTurn {

    record TurnRequest(Long projectId, Long userId, String userMessage, ChatSession chatSession,
                       List<Message> history, boolean teaching, Set<String> recentlyTouched) {

        TurnRequest(Long projectId, Long userId, String userMessage, ChatSession chatSession, List<Message> history) {
            this(projectId, userId, userMessage, chatSession, history, false, Set.of());
        }

        TurnRequest(Long projectId, Long userId, String userMessage, ChatSession chatSession, List<Message> history,
                    boolean teaching) {
            this(projectId, userId, userMessage, chatSession, history, teaching, Set.of());
        }
    }

    private static final class Shown {
        private ProjectBrief brief;
        private final Map<String, String> read = new ConcurrentHashMap<>();

        Shown(ProjectBrief brief) {
            this.brief = brief;
        }

        ProjectBrief brief() {
            return brief;
        }

        void keepWhatWasRead() {
            if (!read.isEmpty()) {
                brief = brief.withRead(new TreeMap<>(read));
            }
        }
    }

    private record Attempt(String text, String finishReason, Usage usage, Throwable error, boolean timedOut,
                           int inputEstimate, boolean budgetSpent) {

        boolean endedNormally() {
            return error == null && !timedOut && !budgetSpent && !"length".equalsIgnoreCase(finishReason);
        }
    }

    private static final class BudgetSpent extends RuntimeException {
        BudgetSpent() {
            super("The daily allowance ran out during this call", null, false, false);
        }
    }

    private record Draft(List<ParsedEvent> events, TurnOutcome outcome, List<String> notices) {
    }

    private record Findings(FileEdits.Resolved resolved, List<SyntaxCheck.Problem> syntax,
                            List<ProjectImports.Problem> imports, List<TypeProblem> types) {

        boolean isClean() {
            return passesTheStaticChecks() && types.isEmpty();
        }

        boolean passesTheStaticChecks() {
            return resolved.isClean() && syntax.isEmpty() && imports.isEmpty();
        }

        int count() {
            return resolved.problems().size() + syntax.size() + imports.size() + types.size();
        }
    }

    private static final class Tally {
        private Integer promptTokens;
        private Integer completionTokens;
        private int calls;
        private boolean cutByBudget;
        private boolean outOfBudget;

        void add(Usage usage) {
            if (usage == null) return;
            if (usage.getPromptTokens() != null) {
                promptTokens = (promptTokens == null ? 0 : promptTokens) + usage.getPromptTokens();
            }
            if (usage.getCompletionTokens() != null) {
                completionTokens = (completionTokens == null ? 0 : completionTokens) + usage.getCompletionTokens();
            }
        }
    }

    static final String EMPTY_ANSWER_NOTICE =
            "The model didn't return an answer for this request, so nothing was changed. Please try sending it again.";
    static final String FAILED_NOTICE =
            "Something went wrong while generating this response, so nothing was changed. Please try again.";
    static final String RATE_LIMITED_NOTICE =
            "The AI provider is rate-limited right now, so nothing was changed. Please try again in a moment.";
    static final String REFUSED_NOTICE =
            "The AI service isn't available right now because of a setup problem on our side, so nothing was changed.";
    static final String TIMED_OUT_NOTICE =
            "The AI provider stopped responding, so nothing was changed. Please try again.";
    static final String STOPPED_NOTICE = "This response was stopped, so none of its changes were saved.";
    static final String INTERRUPTED_NOTICE =
            "The server restarted while this was being generated, so none of its changes were saved. "
                    + "Use Retry to send it again.";

    static final int MAX_EMPTY_RETRIES = 1;
    static final int MAX_BUSY_RETRIES = 3;
    static final int MAX_UNTAGGED_REPLAYED = 4_000;
    static final int CHARS_PER_TOKEN = 4;
    static final int REPORT_SPEND_EVERY = 200;
    static final int ROOM_FOR_A_REPLY = 1_500;
    private static final int TOKENS_PER_FILE_READ = 1_500;
    private static final int MAX_REPRINTED_FILE_CHARS = 60_000;
    private static final Duration ROOM_FOR_ANOTHER_CALL = Duration.ofSeconds(30);
    private static final String PACKAGE_JSON = "package.json";

    private final BuildModel buildModel;
    private final LlmResponseParser parser;
    private final ProjectFileReader projectFileReader;
    private final TurnRecorder recorder;
    private final AiUsageRecorder aiUsageRecorder;
    private final UsageService usageService;
    private final GenerationRegistry generationRegistry;
    private final GenerationProperties properties;
    private final Clock clock;
    private final SyntaxCheck syntaxCheck;
    private final CodeChecker codeChecker;

    public void run(TurnRequest request, ActiveGeneration generation) {
        try {
            Tally tally = new Tally();
            Function<String, Optional<String>> stored = storedFiles(request.projectId());
            Draft draft;
            try {
                draft = write(request, generation, tally, stored);
            } catch (RuntimeException failure) {
                log.error("Build turn for projectId: {} failed while it was being written", request.projectId(), failure);
                draft = new Draft(List.of(), TurnOutcome.FAILED, List.of(FAILED_NOTICE));
            }
            if (!generation.beginSaving()) {
                draft = stopped(generation, parser.parse(generation.text()));
            }
            boolean keepsChanges = draft.outcome() == null || draft.outcome() == TurnOutcome.INCOMPLETE
                    || draft.outcome() == TurnOutcome.OUT_OF_BUDGET;
            if (keepsChanges) {
                draft = withEditsApplied(request, draft, stored);
            }
            if (keepsChanges && draft.events().stream().anyMatch(ParsedEvent::isFileChange)) {
                generation.announce("Saving your changes");
            }
            long seconds = Math.max(1, Duration.between(generation.startedAt(), clock.instant()).toSeconds());
            TurnOutcome outcome = recorder.record(new TurnRecord(request.chatSession(), request.userMessage(),
                    withoutStrayBackslashes(request, draft.events()), draft.outcome(), draft.notices(), seconds,
                    tally.promptTokens, tally.completionTokens, request.teaching()));
            log.info("Build turn for projectId: {} ended {} after {}s", request.projectId(), outcome, seconds);
            generationRegistry.remove(generation);
            generation.finish(outcome.name());
        } catch (Throwable failure) {
            log.error("Build turn for projectId: {} could not be saved", request.projectId(), failure);
            generationRegistry.remove(generation);
            generation.fail(failure);
        } finally {
            aiUsageRecorder.release(generation.takeReservation());
        }
    }

    private Function<String, Optional<String>> storedFiles(Long projectId) {
        Map<String, Optional<String>> seen = new HashMap<>();
        return path -> {
            Optional<String> known = seen.get(path);
            if (known == null) {
                known = readStored(projectId, path);
                seen.put(path, known);
            }
            return known;
        };
    }

    private Optional<String> readStored(Long projectId, String path) {
        try {
            return Optional.ofNullable(projectFileReader.getFileContent(projectId, path).content());
        } catch (FeignException.NotFound e) {
            return Optional.empty();
        } catch (RuntimeException e) {
            log.warn("Couldn't read {} to apply an edit to it for projectId: {}", path, projectId, e);
            return Optional.empty();
        }
    }

    private Draft withEditsApplied(TurnRequest request, Draft draft, Function<String, Optional<String>> stored) {
        if (draft.events().stream().noneMatch(event -> event.type() == ChatEventType.FILE_PATCH)) {
            return draft;
        }
        FileEdits.Resolved resolved = FileEdits.resolve(draft.events(), stored);
        if (resolved.isClean()) {
            return new Draft(resolved.events(), draft.outcome(), draft.notices());
        }
        log.warn("Build turn for projectId: {} is being saved without {} edit(s) that could not be applied: {}",
                request.projectId(), resolved.problems().size(),
                resolved.problems().stream().map(problem -> problem.path() + " (" + problem.reason() + ")").toList());
        List<String> notices = new ArrayList<>(draft.notices());
        notices.add(TurnReview.unappliedNotice(resolved.problems()));
        return new Draft(resolved.events(), draft.outcome() == null ? TurnOutcome.INCOMPLETE : draft.outcome(), notices);
    }

    private Draft write(TurnRequest request, ActiveGeneration generation, Tally tally,
                        Function<String, Optional<String>> stored) {
        Instant deadline = clock.instant().plus(properties.turnTimeout());
        generation.announce("Reading your project");
        Shown brief = new Shown(buildModel.describe(request.projectId(),
                new ProjectBrief.Focus(request.userMessage(), request.recentlyTouched())));
        generation.announce("Thinking it through");
        List<Message> opening = new ArrayList<>(request.history());
        opening.add(new UserMessage(request.userMessage() + PromptUtils.replyShape()));

        List<Message> conversation = opening;
        int continuations = 0;
        int emptyRetries = 0;
        int busyRetries = 0;
        ParsedTurn turn;
        Attempt attempt;

        while (true) {
            if (generation.stopRequested()) {
                return stopped(generation, parser.parse(generation.text()));
            }
            attempt = callModel(request, generation, conversation, deadline, brief, PromptUtils.closingReminder(),
                    AiCallKind.BUILD);
            settle(request, generation, attempt, tally);
            turn = parser.parse(generation.text());
            if (generation.stopRequested()) {
                return stopped(generation, turn);
            }
            if (attempt.budgetSpent()) {
                return outOfBudget(request, generation, turn);
            }

            Review review = TurnReview.of(turn, attempt.endedNormally());
            boolean refused = attempt.error() != null && isProviderRefusal(attempt.error());
            boolean busy = attempt.error() != null && attempt.text().isBlank() && isRateLimited(attempt.error());

            if (busy && !refused && busyRetries < MAX_BUSY_RETRIES && !tally.outOfBudget) {
                busyRetries++;
                generation.announce("The AI provider is busy - trying again in a moment");
                if (pause(generation, deadline, properties.busyPause().multipliedBy(busyRetries))) {
                    continue;
                }
                if (generation.stopRequested()) {
                    return stopped(generation, turn);
                }
            }

            if (review.kind() == Kind.EMPTY) {
                if (!refused && !busy && emptyRetries < MAX_EMPTY_RETRIES && hasRoom(deadline) && !tally.outOfBudget) {
                    emptyRetries++;
                    log.warn("Build turn for projectId: {} came back with nothing usable (finishReason: {}, timed out: {}) "
                            + "- trying once more", request.projectId(), attempt.finishReason(), attempt.timedOut());
                    String untagged = attempt.endedNormally() ? turn.looseText() : "";
                    String thought = attempt.endedNormally() && untagged.isBlank() ? thinkingOf(turn) : "";
                    generation.replaceText(thought.isBlank() ? "" : "<approach>" + thought + "</approach>\n");
                    if (!thought.isBlank()) {
                        generation.announce("Thought it through but didn't answer - asking for the answer");
                        conversation = new ArrayList<>(opening);
                        conversation.add(new AssistantMessage("<approach>" + thought + "</approach>"));
                        conversation.add(new UserMessage(TurnReview.answerReminder()));
                    } else if (untagged.isBlank()) {
                        generation.announce("No answer came back - trying again");
                        conversation = opening;
                    } else {
                        generation.announce("The reply wasn't in a form that can be saved - asking again");
                        conversation = new ArrayList<>(opening);
                        conversation.add(new AssistantMessage(untagged.length() > MAX_UNTAGGED_REPLAYED
                                ? untagged.substring(0, MAX_UNTAGGED_REPLAYED) : untagged));
                        conversation.add(new UserMessage(TurnReview.formatReminder()));
                    }
                    continue;
                }
                if (!attempt.endedNormally()) {
                    return new Draft(turn.events(), TurnOutcome.FAILED, List.of(failureNotice(attempt)));
                }
                if (isAnAnswerInPlainWords(turn.looseText())) {
                    log.warn("Build turn for projectId: {} answered outside the protocol's tags - keeping its words as "
                            + "the answer", request.projectId());
                    List<ParsedEvent> events = new ArrayList<>(turn.events());
                    events.add(new ParsedEvent(ChatEventType.MESSAGE, null, turn.looseText(), null, 0, turn.text().length()));
                    return new Draft(events, null, List.of());
                }
                return new Draft(turn.events(), TurnOutcome.EMPTY, turn.rejectedPaths().isEmpty()
                        ? List.of(EMPTY_ANSWER_NOTICE)
                        : List.of(refusedPathsNotice(turn) + " Nothing was changed."));
            }

            if (review.kind() == Kind.CONTINUE && !refused && tally.outOfBudget) {
                log.warn("Build turn for projectId: {} stopped early with no allowance left to carry it on",
                        request.projectId());
                return outOfBudget(request, generation, turn);
            }
            if (review.kind() == Kind.CONTINUE && !refused && continuations < properties.maxContinuations()
                    && hasRoom(deadline)) {
                continuations++;
                log.warn("Build turn for projectId: {} stopped early (finishReason: {}, {} file(s) still to write) - "
                        + "continuing, pass {}", request.projectId(), attempt.finishReason(), review.missing().size(), continuations);
                String kept = turn.text().substring(0, review.keepUntil());
                if (kept.length() < turn.text().length()) {
                    generation.replaceText(kept);
                }
                generation.announce(review.statusLine());
                conversation = carriedOn(opening, turn, kept, review.instruction());
                continue;
            }
            break;
        }

        List<String> notices = new ArrayList<>();
        turn = repair(request, generation, opening, turn, deadline, tally, notices, brief, stored);
        if (generation.stopRequested()) {
            return stopped(generation, turn);
        }
        if (tally.cutByBudget) {
            return outOfBudget(request, generation, turn);
        }

        Review finalReview = TurnReview.of(turn, true);
        TurnOutcome outcome = null;
        if (finalReview.kind() == Kind.CONTINUE) {
            outcome = TurnOutcome.INCOMPLETE;
            notices.addFirst(finalReview.unfinishedNotice());
        } else if (!attempt.endedNormally() && turn.events().stream().noneMatch(BuildTurn::settlesTheTurn)) {
            outcome = TurnOutcome.FAILED;
            notices.addFirst(failureNotice(attempt));
        }
        if (!turn.rejectedPaths().isEmpty()) {
            notices.add(refusedPathsNotice(turn));
        }
        return new Draft(withUntaggedWords(turn, withTrailingMessage(turn)), outcome, notices);
    }

    private static List<ParsedEvent> withoutStrayBackslashes(TurnRequest request, List<ParsedEvent> events) {
        List<ParsedEvent> tidied = new ArrayList<>(events.size());
        for (ParsedEvent event : events) {
            if (event.type() != ChatEventType.FILE_EDIT) {
                tidied.add(event);
                continue;
            }
            StrayBackslashes.Tidied file = StrayBackslashes.remove(event.path(), event.content());
            if (file.removed() > 0) {
                log.warn("Removed {} stray backslash(es) the model left at line ends in {} for projectId: {}",
                        file.removed(), event.path(), request.projectId());
            }
            tidied.add(file.removed() == 0 ? event : new ParsedEvent(event.type(), event.path(), file.content(),
                    event.metadata(), event.start(), event.end()));
        }
        return tidied;
    }

    private static String thinkingOf(ParsedTurn turn) {
        StringBuilder thought = new StringBuilder();
        for (ParsedEvent event : turn.events()) {
            if (event.type() == ChatEventType.THINKING) {
                thought.append(thought.isEmpty() ? "" : "\n").append(event.content());
            }
        }
        return thought.length() > MAX_UNTAGGED_REPLAYED ? thought.substring(0, MAX_UNTAGGED_REPLAYED) : thought.toString();
    }

    private static boolean isTheWorkItself(ParsedEvent event) {
        return event.type() != ChatEventType.TOOL_LOG && event.type() != ChatEventType.THINKING;
    }

    private static List<ParsedEvent> withUntaggedWords(ParsedTurn turn, List<ParsedEvent> events) {
        boolean spoke = events.stream().anyMatch(event -> event.type() == ChatEventType.MESSAGE);
        int firstStep = events.stream().filter(BuildTurn::isTheWorkItself)
                .mapToInt(ParsedEvent::start).min().orElse(-1);
        if (spoke || firstStep < 0) {
            return events;
        }
        int lastStep = events.stream().mapToInt(ParsedEvent::end).max().orElse(firstStep);
        int thoughtUntil = events.stream()
                .filter(event -> event.type() == ChatEventType.THINKING && event.end() <= firstStep)
                .mapToInt(ParsedEvent::end).max().orElse(0);
        String opening = keptWords(turn.looseTextBetween(thoughtUntil, firstStep));
        String closing = keptWords(turn.looseTextBetween(lastStep, turn.text().length()));
        if (opening == null && closing == null) {
            return events;
        }

        List<ParsedEvent> spoken = new ArrayList<>(events.size() + 2);
        boolean opened = opening == null;
        for (ParsedEvent event : events) {
            if (!opened && isTheWorkItself(event)) {
                spoken.add(new ParsedEvent(ChatEventType.MESSAGE, null, opening, null, thoughtUntil, firstStep));
                opened = true;
            }
            spoken.add(event);
        }
        if (closing != null) {
            spoken.add(new ParsedEvent(ChatEventType.MESSAGE, null, closing, null, lastStep, turn.text().length()));
        }
        return spoken;
    }

    private static String keptWords(String words) {
        return isAnAnswerInPlainWords(words) && words.length() <= MAX_UNTAGGED_REPLAYED ? words : null;
    }

    private static String refusedPathsNotice(ParsedTurn turn) {
        List<String> refused = turn.rejectedPaths();
        return "I couldn't write " + refused.size() + (refused.size() == 1 ? " file" : " files")
                + " because the path isn't a plain path inside the project: " + String.join(", ", refused) + ".";
    }

    private static boolean isAnAnswerInPlainWords(String looseText) {
        return !looseText.isBlank() && !looseText.contains("<file") && !looseText.contains("</file>");
    }

    private static List<Message> carriedOn(List<Message> opening, ParsedTurn turn, String kept, String instruction) {
        List<Message> conversation = new ArrayList<>(opening);
        String said = withoutReadNotes(turn, kept);
        if (!said.isBlank()) {
            conversation.add(new AssistantMessage(said));
        }
        conversation.add(new UserMessage(instruction));
        return conversation;
    }

    private static String withoutReadNotes(ParsedTurn turn, String kept) {
        StringBuilder said = new StringBuilder(kept.length());
        int from = 0;
        for (ParsedEvent event : turn.events()) {
            if (event.type() != ChatEventType.TOOL_LOG || event.start() < from || event.end() > kept.length()) {
                continue;
            }
            said.append(kept, from, event.start());
            from = event.end();
        }
        return said.append(kept, from, kept.length()).toString();
    }

    private static boolean settlesTheTurn(ParsedEvent event) {
        return event.isFileChange() || event.type() == ChatEventType.ASK;
    }

    private Draft outOfBudget(TurnRequest request, ActiveGeneration generation, ParsedTurn turn) {
        log.warn("Build turn for projectId: {} ran out of the daily allowance - keeping what it finished",
                request.projectId());
        boolean finishedFiles = turn.events().stream().anyMatch(ParsedEvent::isFileChange);
        generation.announce(finishedFiles
                ? "Today's AI allowance ran out - keeping what was finished"
                : "Today's AI allowance ran out");
        List<String> notices = new ArrayList<>();
        notices.add(TurnReview.of(turn, false).outOfBudgetNotice());
        if (!turn.rejectedPaths().isEmpty()) {
            notices.add(refusedPathsNotice(turn));
        }
        return new Draft(withUntaggedWords(turn, withTrailingMessage(turn)), TurnOutcome.OUT_OF_BUDGET, notices);
    }

    private Draft stopped(ActiveGeneration generation, ParsedTurn turn) {
        return generation.abandoned()
                ? new Draft(withTrailingMessage(turn), TurnOutcome.FAILED, List.of(INTERRUPTED_NOTICE))
                : new Draft(withTrailingMessage(turn), TurnOutcome.STOPPED, List.of(STOPPED_NOTICE));
    }

    private List<ParsedEvent> withTrailingMessage(ParsedTurn turn) {
        if (!turn.endsMidBlock() || turn.cutOff().type() != ChatEventType.MESSAGE || turn.cutOff().partial().isBlank()) {
            return turn.events();
        }
        List<ParsedEvent> events = new ArrayList<>(turn.events());
        events.add(new ParsedEvent(ChatEventType.MESSAGE, null, turn.cutOff().partial().strip(), null,
                turn.cutOff().start(), turn.text().length()));
        return events;
    }

    private ParsedTurn repair(TurnRequest request, ActiveGeneration generation, List<Message> opening,
                              ParsedTurn turn, Instant deadline, Tally tally, List<String> notices,
                              Shown brief, Function<String, Optional<String>> stored) {
        Findings findings = inspect(request, generation, turn, stored);
        for (int repair = 0; repair < properties.maxRepairs() && !findings.isClean() && hasRoom(deadline)
                && !tally.outOfBudget; repair++) {
            log.warn("Build turn for projectId: {} left {} edit(s) that could not be applied, {} file(s) that do not "
                            + "parse, {} import(s) that do not resolve and {} compiler error(s) - asking the model to "
                            + "repair them: {} {} {}",
                    request.projectId(), findings.resolved().problems().size(), findings.syntax().size(),
                    findings.imports().size(), findings.types().size(),
                    findings.resolved().problems().stream().map(problem -> problem.path() + " (" + problem.reason() + ")").toList(),
                    findings.syntax().stream().map(SyntaxCheck.Problem::describe).toList(),
                    findings.types().stream().map(TypeProblem::describe).toList());
            String settled = withoutUnapplied(turn, findings.resolved().unapplied());
            ParsedTurn kept = turn;
            if (!settled.equals(turn.text())) {
                generation.replaceText(settled);
                kept = parser.parse(settled);
            }
            generation.announce("Checking the result - fixing " + findings.count()
                    + (findings.count() == 1 ? " problem" : " problems") + " before saving");

            List<Message> conversation = carriedOn(opening, kept, settled, TurnReview.repairInstruction(
                    findings.resolved().problems(), findings.syntax(), findings.imports(), findings.types(),
                    asTheyAre(findings.resolved(), stored)));
            settle(request, generation, callModel(request, generation, conversation, deadline, brief,
                    PromptUtils.followUpReminder(), AiCallKind.REPAIR), tally);
            if (generation.stopRequested()) {
                return turn;
            }
            turn = parser.parse(generation.text());
            findings = inspect(request, generation, turn, stored);
        }
        if (!findings.types().isEmpty()) {
            notices.add(TurnReview.typeNotice(findings.types()));
        }
        if (!findings.syntax().isEmpty()) {
            notices.add(TurnReview.syntaxNotice(findings.syntax()));
        }
        if (!findings.imports().isEmpty()) {
            notices.add(TurnReview.unresolvedNotice(findings.imports()));
        }
        return turn;
    }

    private static Map<String, String> asTheyAre(FileEdits.Resolved resolved, Function<String, Optional<String>> stored) {
        Map<String, String> files = new LinkedHashMap<>();
        int characters = 0;
        for (FileEdits.Problem problem : resolved.problems()) {
            if (files.containsKey(problem.path())) {
                continue;
            }
            String content = resolved.events().stream()
                    .filter(event -> event.type() == ChatEventType.FILE_EDIT && event.path().equals(problem.path()))
                    .map(ParsedEvent::content).findFirst()
                    .orElseGet(() -> stored.apply(problem.path()).orElse(null));
            if (content == null || characters + content.length() > MAX_REPRINTED_FILE_CHARS) {
                continue;
            }
            characters += content.length();
            files.put(problem.path(), content);
        }
        return files;
    }

    private static String withoutUnapplied(ParsedTurn turn, List<ParsedEvent> unapplied) {
        int limit = turn.endsMidBlock() ? turn.cutOff().start() : turn.text().length();
        if (!unapplied.isEmpty()) {
            int lastStep = -1;
            for (ParsedEvent event : turn.events()) {
                if (event.type() != ChatEventType.MESSAGE && event.end() <= limit) {
                    lastStep = Math.max(lastStep, event.end());
                }
            }
            limit = lastStep >= 0 ? lastStep : limit;
        }
        StringBuilder kept = new StringBuilder(limit);
        int from = 0;
        for (ParsedEvent event : unapplied) {
            if (event.start() < from || event.end() > limit) {
                continue;
            }
            kept.append(turn.text(), from, event.start());
            from = event.end();
        }
        return kept.append(turn.text(), from, limit).toString();
    }

    private Findings inspect(TurnRequest request, ActiveGeneration generation, ParsedTurn turn,
                             Function<String, Optional<String>> stored) {
        FileEdits.Resolved resolved = FileEdits.resolve(turn.events(), stored);
        Map<String, String> written = new LinkedHashMap<>();
        Set<String> deleted = new HashSet<>();
        for (ParsedEvent event : resolved.events()) {
            if (event.type() == ChatEventType.FILE_EDIT) {
                written.put(event.path(), StrayBackslashes.remove(event.path(), event.content()).content());
            } else if (event.type() == ChatEventType.FILE_DELETE) {
                deleted.add(event.path());
            }
        }
        if (written.isEmpty()) {
            return new Findings(resolved, List.of(), List.of(), List.of());
        }
        Findings found = new Findings(resolved, syntaxProblems(request, written),
                importProblems(request, written, deleted), List.of());
        if (!found.passesTheStaticChecks() || generation.stopRequested()) {
            return found;
        }
        return new Findings(resolved, List.of(), List.of(), typeProblems(request, generation, written, deleted));
    }

    private List<TypeProblem> typeProblems(TurnRequest request, ActiveGeneration generation,
                                           Map<String, String> written, Set<String> deleted) {
        generation.announce("Checking the code before saving");
        CodeCheckResponse checked = codeChecker.check(request.projectId(), written, deleted);
        if (!checked.checked()) {
            log.info("The files written for projectId: {} were not type-checked: {}", request.projectId(),
                    checked.skippedBecause());
            return List.of();
        }
        List<TypeProblem> problems = new ArrayList<>();
        for (CodeCheckResponse.Problem problem : checked.problems()) {
            String content = written.get(problem.path());
            problems.add(new TypeProblem(problem.path(), problem.line(), problem.message(),
                    content == null || problem.line() <= 0 ? "" : SyntaxCheck.excerpt(content, problem.line())));
        }
        return problems;
    }

    private List<SyntaxCheck.Problem> syntaxProblems(TurnRequest request, Map<String, String> written) {
        try {
            return syntaxCheck.check(written);
        } catch (RuntimeException e) {
            log.warn("Couldn't check the syntax of the files written for projectId: {} - saving them unchecked",
                    request.projectId(), e);
            return List.of();
        }
    }

    private List<ProjectImports.Problem> importProblems(TurnRequest request, Map<String, String> written,
                                                        Set<String> deleted) {
        try {
            Set<String> paths = new HashSet<>();
            for (FileTreeDto.Entry entry : projectFileReader.getFileTree(request.projectId()).entries()) {
                paths.add(entry.path());
            }
            boolean hadPackageJson = paths.contains(PACKAGE_JSON);
            paths.addAll(written.keySet());
            paths.removeAll(deleted);

            String packageJson = written.get(PACKAGE_JSON);
            if (packageJson == null && hadPackageJson && !deleted.contains(PACKAGE_JSON)) {
                packageJson = projectFileReader.getFileContent(request.projectId(), PACKAGE_JSON).content();
            }
            return ProjectImports.unresolved(paths, written, packageJson);
        } catch (RuntimeException e) {
            log.warn("Couldn't check the imports of the files written for projectId: {} - saving them unchecked",
                    request.projectId(), e);
            return List.of();
        }
    }

    private Attempt callModel(TurnRequest request, ActiveGeneration generation, List<Message> conversation,
                              Instant deadline, Shown shown, String afterEveryRead, AiCallKind kind) {
        ProjectBrief brief = shown.brief();
        Duration limit = Duration.between(clock.instant(), deadline);
        if (limit.compareTo(properties.attemptTimeout()) > 0) {
            limit = properties.attemptTimeout();
        }
        int promptEstimate = estimatedPromptTokens(request, conversation, brief);
        if (limit.isNegative() || limit.isZero()) {
            return new Attempt("", null, null, null, true, promptEstimate, false);
        }
        UsageReservation budget = generation.reservation();
        if (overBudget(budget, promptEstimate)) {
            return new Attempt("", null, null, null, false, promptEstimate, true);
        }

        StringBuilder text = new StringBuilder();
        AtomicReference<Usage> usage = new AtomicReference<>();
        AtomicReference<String> finishReason = new AtomicReference<>();
        CompletableFuture<Void> finished = new CompletableFuture<>();
        Instant asked = clock.instant();
        AtomicReference<Instant> firstWord = new AtomicReference<>();
        AtomicInteger inputEstimate = new AtomicInteger(promptEstimate);
        AtomicInteger lastReported = new AtomicInteger(promptEstimate);
        CodeGenerationTools tools = new CodeGenerationTools(projectFileReader, request.projectId(), brief.shownPaths(),
                afterEveryRead.strip(), paths -> {
                    inputEstimate.addAndGet(promptEstimate + paths.size() * TOKENS_PER_FILE_READ);
                    generation.filesRead(paths);
                }, shown.read::put);

        Disposable subscription = buildModel
                .stream(conversation, tools, brief, kind)
                .timeout(properties.idleTimeout())
                .subscribe(response -> {
                    if (finished.isDone()) {
                        return;
                    }
                    if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                        usage.set(response.getMetadata().getUsage());
                    }
                    if (response.getResult() == null) {
                        return;
                    }
                    String reason = response.getResult().getMetadata() == null
                            ? null
                            : response.getResult().getMetadata().getFinishReason();
                    if (reason != null && !reason.isBlank()) {
                        finishReason.set(reason);
                    }
                    String chunk = response.getResult().getOutput().getText();
                    if (chunk != null && !chunk.isEmpty()) {
                        firstWord.compareAndSet(null, clock.instant());
                        int written;
                        synchronized (text) {
                            text.append(chunk);
                            written = text.length();
                        }
                        generation.append(chunk);
                        int estimate = inputEstimate.get() + written / CHARS_PER_TOKEN;
                        if (estimate - lastReported.get() >= REPORT_SPEND_EVERY) {
                            lastReported.set(estimate);
                            if (overBudget(budget, estimate)) {
                                finished.completeExceptionally(new BudgetSpent());
                            }
                        }
                    }
                }, finished::completeExceptionally, () -> finished.complete(null));

        generation.onCancel(() -> {
            subscription.dispose();
            finished.completeExceptionally(new GenerationStoppedException());
        });

        Throwable error = null;
        boolean timedOut = false;
        boolean budgetSpent = false;
        try {
            finished.get(limit.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            timedOut = true;
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof TimeoutException) {
                timedOut = true;
            } else if (cause instanceof BudgetSpent) {
                budgetSpent = true;
            } else if (!(cause instanceof GenerationStoppedException)) {
                error = cause;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            error = e;
        } finally {
            subscription.dispose();
            generation.onCancel(null);
        }

        if (budgetSpent) {
            log.warn("The model call for projectId: {} was ended because the daily allowance ran out", request.projectId());
        } else if (timedOut) {
            log.warn("The model call for projectId: {} was abandoned after going silent or running too long", request.projectId());
        } else if (error != null) {
            log.error("The model call for projectId: {} failed", request.projectId(), error);
        }
        String written;
        synchronized (text) {
            written = text.toString();
        }
        shown.keepWhatWasRead();
        log.info("The {} call for projectId: {} wrote its first word after {} ms and ended after {} ms ({} characters, about {} prompt tokens)",
                kind, request.projectId(),
                firstWord.get() == null ? "no" : Duration.between(asked, firstWord.get()).toMillis(),
                Duration.between(asked, clock.instant()).toMillis(), written.length(), promptEstimate);
        return new Attempt(written, finishReason.get(), usage.get(), error, timedOut, inputEstimate.get(), budgetSpent);
    }

    private static int estimatedPromptTokens(TurnRequest request, List<Message> conversation, ProjectBrief brief) {
        long characters = PromptUtils.getSystemPrompt(brief.kit()).length() + brief.text().length()
                + PromptUtils.closingReminder().length();
        for (Message message : conversation) {
            characters += message.getText() == null ? 0 : message.getText().length();
        }
        return (int) Math.min(Integer.MAX_VALUE, characters / CHARS_PER_TOKEN);
    }

    private boolean overBudget(UsageReservation budget, int estimatedTokens) {
        try {
            return usageService.exceedsBudget(budget, estimatedTokens);
        } catch (RuntimeException e) {
            log.warn("Couldn't check a build turn's spend against the daily allowance - letting it carry on", e);
            return false;
        }
    }

    private void settle(TurnRequest request, ActiveGeneration generation, Attempt attempt, Tally tally) {
        Usage usage = attempt.usage();
        boolean reported = usage != null && usage.getTotalTokens() != null && usage.getTotalTokens() > 0;
        tally.add(reported ? usage : null);
        tally.cutByBudget |= attempt.budgetSpent();

        UsageFeature feature = tally.calls++ == 0 ? UsageFeature.BUILD : UsageFeature.BUILD_RETRY;
        UsageRecord charge = null;
        if (reported) {
            charge = new UsageRecord(request.userId(), request.projectId(), feature,
                    usage.getPromptTokens() == null ? 0 : usage.getPromptTokens(),
                    usage.getCompletionTokens() == null ? 0 : usage.getCompletionTokens(), usage.getTotalTokens());
        } else if (!attempt.text().isBlank()) {
            int written = Math.max(1, attempt.text().length() / CHARS_PER_TOKEN);
            charge = new UsageRecord(request.userId(), request.projectId(), feature, attempt.inputEstimate(), written,
                    attempt.inputEstimate() + written);
            log.info("Charging an estimated {} token(s) for a model call that ended without a usage report, projectId: {}",
                    charge.totalTokens(), request.projectId());
        }
        try {
            boolean spent = usageService.settleCall(generation.reservation(), charge,
                    attempt.inputEstimate() + ROOM_FOR_A_REPLY);
            tally.outOfBudget = spent || attempt.budgetSpent();
        } catch (RuntimeException e) {
            tally.outOfBudget = attempt.budgetSpent();
            log.warn("Couldn't settle token usage for projectId: {}", request.projectId(), e);
        }
    }

    private boolean hasRoom(Instant deadline) {
        return clock.instant().plus(ROOM_FOR_ANOTHER_CALL).isBefore(deadline);
    }

    private boolean pause(ActiveGeneration generation, Instant deadline, Duration length) {
        Instant until = clock.instant().plus(length);
        if (!until.plus(ROOM_FOR_ANOTHER_CALL).isBefore(deadline)) {
            return false;
        }
        try {
            while (clock.instant().isBefore(until)) {
                if (generation.stopRequested()) {
                    return false;
                }
                Thread.sleep(200);
            }
            return !generation.stopRequested();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String failureNotice(Attempt attempt) {
        if (attempt.timedOut()) return TIMED_OUT_NOTICE;
        if (attempt.error() != null && isProviderRefusal(attempt.error())) return REFUSED_NOTICE;
        if (attempt.error() != null && isRateLimited(attempt.error())) return RATE_LIMITED_NOTICE;
        return FAILED_NOTICE;
    }

    static boolean isProviderRefusal(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof WebClientResponseException response) {
                int status = response.getStatusCode().value();
                if (status == 401 || status == 402 || status == 403) {
                    return true;
                }
            }
        }
        return false;
    }

    static boolean isRateLimited(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof WebClientResponseException.TooManyRequests) {
                return true;
            }
        }
        return false;
    }
}
