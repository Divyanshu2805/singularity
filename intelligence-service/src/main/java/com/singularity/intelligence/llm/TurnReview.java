package com.singularity.intelligence.llm;

import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedTurn;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Decides whether a build answer is finished, and what to say to the model when it is not.
 *
 * <p>Handles: comparing the files an answer planned with the files it wrote; noticing an answer that stopped inside a
 * file, listed steps and wrote nothing, or came back empty; working out how much of the text is worth keeping when
 * the model is asked to carry on; and wording that request, the request to repair what a check of the written files
 * found - an edit that could not be applied, a file that does not parse, an import that does not resolve, an error
 * from the compiler - the
 * reminder sent to a model that answered outside the protocol's tags, and the notes left in the transcript when a
 * turn still ends unfinished, is cut short because the daily allowance ran out, or is saved with a problem the model
 * did not manage to repair.
 *
 * <p>An unfinished answer is continued, not repeated. The model is shown what it already wrote and asked only for the
 * rest, where the pipeline used to send the same request again from scratch - paying for every file a second time and
 * often stopping in the same place. When files are still owed, text after the last file or step is dropped before
 * continuing, since a closing "all done" written by a reply that was not done would otherwise sit in the middle of
 * the finished transcript. A half-written block at the very end is always dropped.
 *
 * <p>Reading files and then answering in words is a complete answer. It was once treated as an abandoned edit and
 * retried, which made every question about a project ("how does the routing work?") run twice and end with a note
 * saying the change could not be finished. Only a planned file that was never written, steps with no files at all, or
 * a call that did not end cleanly - cut off for length, gone silent, failed part-way - now count as unfinished, and
 * never when the answer asked the user a question. A turn that asks has stopped on purpose: it may have written
 * nothing at all, or the part it could build without the answer, and either way the rest waits for the user.
 *
 * <p>Empty means the model said nothing in the protocol at all - no message, step, file or question. The note that
 * files were read is written by the server, not the model, so an answer holding only that is as empty as one holding
 * nothing; counting it as an answer would save a turn that shows "Read 2 files" and not a word more. The model's
 * working-out is not an answer either: a reply that thought the request through and then stopped has told the person
 * nothing, so it is asked for the answer itself ({@link #answerReminder()}). The one exception is a reply that ended
 * normally inside its only message: a model that forgets the closing tag has still answered, and asking again would
 * throw away what the person has already watched arrive.
 *
 * <p>A repair request shows the model what is wrong, not only that something is. For a file that does not parse it
 * quotes the lines around the error with their numbers, because the model is asked to mend them with an edit and an
 * edit has to quote the file as it now stands - which, for a file the same reply wrote or changed, is not what the
 * project description shows. For an edit that could not be applied it quotes the start of the text that was looked
 * for and says the change was not made, so the model does not carry on as if it had been. It also prints the file
 * the edit was for, as it stands: a repair is a new call, which has none of what the model read through its tool in
 * the call before, and a model told to copy lines from a file it can no longer see reads the file again - a second
 * round trip that resends the whole conversation - or copies from memory.
 */
public final class TurnReview {

    public enum Kind {
        COMPLETE,
        CONTINUE,
        EMPTY
    }

    public record Review(Kind kind, List<String> written, List<String> missing, String cutOffPath, int keepUntil,
                         int plannedSteps, boolean stepsWithoutFiles) {

        public String statusLine() {
            if (missing.isEmpty()) {
                return "The reply stopped early - carrying on";
            }
            return "The reply stopped early - writing the " + missing.size() + (missing.size() == 1 ? " file" : " files")
                    + " still left";
        }

        public String instruction() {
            StringBuilder text = new StringBuilder(
                    "Your previous reply ended before the work was finished, so continue it now.\n");
            if (!written.isEmpty()) {
                text.append("\nAlready written in that reply - do NOT output these again:\n");
                written.forEach(path -> text.append("- ").append(path).append('\n'));
            }
            if (!missing.isEmpty()) {
                text.append("\nStill to write:\n");
                for (String path : missing) {
                    text.append("- ").append(path);
                    if (path.equals(cutOffPath)) {
                        text.append(" (this one was cut off part-way and discarded - write it again in full)");
                    }
                    text.append('\n');
                }
            } else if (stepsWithoutFiles) {
                text.append("\nYou listed the steps but wrote no files. Write them now.\n");
            } else {
                text.append("\nYour reply was cut off before it finished. Carry on from where it stopped: write only ")
                        .append("what was still to come, and end with ONE short final <message>. Do not repeat ")
                        .append("anything you already wrote.");
                return text.toString();
            }
            text.append("\nOutput ONLY the remaining <file>, <edit> and <delete> tags, each one complete (and each with its ")
                    .append("<learn> first, if you were writing those), followed by ONE short final <message>. Do not ")
                    .append("write another <approach>, and do not repeat the opening message, the checklist, or any file ")
                    .append("already written. Do not read files again unless you need one you have not seen.");
            return text.toString();
        }

        public String outOfBudgetNotice() {
            String refill = " Your allowance refills at midnight, or you can upgrade for a bigger daily budget.";
            if (written.isEmpty()) {
                return "Today's AI allowance ran out before any file was finished, so nothing was changed."
                        + refill + " Send this again once there is allowance to use.";
            }
            if (missing.isEmpty()) {
                return "Today's AI allowance ran out as this was finishing. The files it wrote were saved." + refill;
            }
            String progress = plannedSteps == 0
                    ? written.size() + (written.size() == 1 ? " file was" : " files were") + " finished and saved"
                    : (plannedSteps - Math.min(plannedSteps, missing.size())) + " of " + plannedSteps
                    + " steps were finished and saved";
            return "Today's AI allowance ran out part-way through. " + progress + "; the rest weren't written, so the "
                    + "preview may show errors until they are." + refill + " Use Retry then to carry on from here.";
        }

        public String unfinishedNotice() {
            String remaining = plannedSteps == 0 || missing.isEmpty()
                    ? ""
                    : " " + (plannedSteps - Math.min(plannedSteps, missing.size())) + " of " + plannedSteps
                    + " steps are done; the rest weren't written.";
            return "This answer stopped before it finished." + remaining + " Use Retry to carry on from here.";
        }
    }

    public record TypeProblem(String path, int line, String message, String excerpt) {

        public String describe() {
            return line > 0 ? path + ", line " + line + ": " + message : path + ": " + message;
        }
    }

    private TurnReview() {
    }

    public static Review of(ParsedTurn turn, boolean endedNormally) {
        List<ParsedEvent> events = turn.events();
        if (events.stream().allMatch(TurnReview::isNotAnAnswer)) {
            boolean leftItsMessageOpen = endedNormally && turn.endsMidBlock()
                    && turn.cutOff().type() == ChatEventType.MESSAGE && !turn.cutOff().partial().isBlank();
            return leftItsMessageOpen
                    ? new Review(Kind.COMPLETE, List.of(), List.of(), null, turn.text().length(), 0, false)
                    : new Review(Kind.EMPTY, List.of(), List.of(), null, 0, 0, false);
        }

        Set<String> written = new LinkedHashSet<>();
        Set<String> planned = new LinkedHashSet<>();
        boolean asked = false;
        boolean hasSteps = false;
        for (ParsedEvent event : events) {
            if (event.isFileChange()) {
                written.add(event.path());
            } else if (event.type() == ChatEventType.TODO) {
                hasSteps = true;
                if (event.path() != null) {
                    planned.add(event.path());
                }
            } else if (event.type() == ChatEventType.ASK) {
                asked = true;
            }
        }

        List<String> missing = new ArrayList<>(planned);
        missing.removeAll(written);

        String cutOffPath = null;
        boolean cutOffInAFile = turn.endsMidBlock() && (turn.cutOff().type() == ChatEventType.FILE_EDIT
                || turn.cutOff().type() == ChatEventType.FILE_PATCH);
        if (cutOffInAFile && turn.cutOff().path() != null && !written.contains(turn.cutOff().path())) {
            cutOffPath = turn.cutOff().path();
            if (!missing.contains(cutOffPath)) {
                missing.add(cutOffPath);
            }
        }

        boolean stepsWithoutFiles = hasSteps && written.isEmpty();
        boolean unfinished = !asked && (!missing.isEmpty() || stepsWithoutFiles || !endedNormally);

        boolean hasFilesToWrite = !missing.isEmpty() || stepsWithoutFiles;
        return new Review(unfinished ? Kind.CONTINUE : Kind.COMPLETE, List.copyOf(written), List.copyOf(missing),
                cutOffPath, keepUntil(turn, hasFilesToWrite), planned.size(), stepsWithoutFiles);
    }

    private static boolean isNotAnAnswer(ParsedEvent event) {
        return event.type() == ChatEventType.TOOL_LOG || event.type() == ChatEventType.THINKING;
    }

    private static int keepUntil(ParsedTurn turn, boolean hasFilesToWrite) {
        int limit = turn.endsMidBlock() ? turn.cutOff().start() : turn.text().length();
        if (!hasFilesToWrite) {
            return limit;
        }
        int lastStep = -1;
        for (ParsedEvent event : turn.events()) {
            if (event.type() != ChatEventType.MESSAGE && event.end() <= limit) {
                lastStep = Math.max(lastStep, event.end());
            }
        }
        return lastStep >= 0 ? lastStep : limit;
    }

    public static String formatReminder() {
        return "Your reply did not use the required tags, so none of it could be shown or saved. Answer again now and "
                + "follow the output format exactly. Everything you say goes inside <message> tags. If you are "
                + "writing files, keep the order: one short <message> saying what you are about to do, one "
                + "<todo path=\"...\"> per file, then every new file inside its own <file path=\"...\"> tag with its "
                + "complete content and every change to an existing file inside an <edit path=\"...\"> tag holding "
                + "SEARCH/REPLACE blocks, then one short final <message>. Nothing is written outside a tag, and no "
                + "file is presented with a Markdown heading or a ``` code fence.";
    }

    public static String answerReminder() {
        return "You worked the request out and then stopped, so the user has no answer yet. Do not think "
                + "it through again. Write the answer now, in the output format: one short <message> saying what you "
                + "are about to do, one <todo path=\"...\"> per file, every new file inside its own "
                + "<file path=\"...\"> tag with its complete content and every change to an existing file inside an "
                + "<edit path=\"...\"> tag holding SEARCH/REPLACE blocks, then one short final <message>. If no files "
                + "are needed, answer in a single <message>.";
    }

    public static String repairInstruction(List<FileEdits.Problem> edits, List<SyntaxCheck.Problem> syntax,
                                           List<ProjectImports.Problem> imports) {
        return repairInstruction(edits, syntax, imports, Map.of());
    }

    public static String repairInstruction(List<FileEdits.Problem> edits, List<SyntaxCheck.Problem> syntax,
                                           List<ProjectImports.Problem> imports, Map<String, String> filesAsTheyAre) {
        return repairInstruction(edits, syntax, imports, List.of(), filesAsTheyAre);
    }

    public static String repairInstruction(List<FileEdits.Problem> edits, List<SyntaxCheck.Problem> syntax,
                                           List<ProjectImports.Problem> imports, List<TypeProblem> types,
                                           Map<String, String> filesAsTheyAre) {
        StringBuilder text = new StringBuilder(
                "I checked what you wrote and found problems that would break the app. Fix them now.\n");
        if (!edits.isEmpty()) {
            text.append("\nEdits that could not be applied - these changes were NOT made, and the files are as they were:\n");
            edits.forEach(problem -> text.append("- ").append(problem.describe()).append('\n'));
            text.append("Write ONLY these edits again - everything else in your reply was applied and must not be ")
                    .append("written a second time. Copy the SEARCH lines exactly from the file - same indentation, ")
                    .append("same quotes, no \"...\", each line on a line of its own - with enough lines to match one ")
                    .append("place only, and keep them few: the lines that change and one or two beside them.\n");
            filesAsTheyAre.forEach((path, content) -> text.append("\n--- ").append(path).append(", exactly as it is now ---\n")
                    .append(FileFence.guard(content)).append(content.endsWith("\n") ? "" : "\n").append("--- end of ").append(path).append(" ---\n"));
            if (edits.stream().anyMatch(problem -> !filesAsTheyAre.containsKey(problem.path()))) {
                text.append("A file not printed here is as shown under FILES; if it is not shown there either, read it ")
                        .append("with read_files first.\n");
            }
        }
        if (!syntax.isEmpty()) {
            text.append("\nFiles that do not parse:\n");
            for (SyntaxCheck.Problem problem : syntax) {
                text.append("- ").append(problem.describe()).append('\n').append(problem.excerpt());
            }
            text.append("The numbered lines are the file as it now stands, after your changes. Mend each with an ")
                    .append("<edit> whose SEARCH is copied from those lines (without the numbers), changing only what ")
                    .append("is wrong.\n");
        }
        if (!imports.isEmpty()) {
            text.append("\nImports that cannot be resolved:\n");
            imports.forEach(problem -> text.append("- ").append(problem.describe()).append('\n'));
            text.append("Write each missing file in full, or correct the import to a file that exists. For a missing ")
                    .append("package, either add it to package.json or remove the import and use what is installed.\n");
        }
        if (!types.isEmpty()) {
            text.append("\nErrors the TypeScript compiler found when it checked these files with the project's packages:\n");
            for (TypeProblem problem : types) {
                text.append("- ").append(problem.describe()).append('\n').append(problem.excerpt());
            }
            text.append("The numbered lines are the file as it now stands, after your changes. Mend each with an ")
                    .append("<edit> whose SEARCH is copied from those lines (without the numbers), changing only what ")
                    .append("the error is about. Do not silence an error with `any` or a ts-ignore comment. If a ")
                    .append("package cannot be installed, take it out of package.json and use what is installed.\n");
        }
        text.append("\nOutput ONLY the <edit> and <file> tags that are needed, followed by ONE short final <message>. ")
                .append("You may change again a file you already wrote or edited in this reply.");
        return text.toString();
    }

    public static String unappliedNotice(List<FileEdits.Problem> problems) {
        List<String> paths = problems.stream().map(FileEdits.Problem::path).distinct().toList();
        return "I couldn't apply my change to " + String.join(", ", paths) + ", so "
                + (paths.size() == 1 ? "that file was" : "those files were")
                + " left as " + (paths.size() == 1 ? "it was" : "they were") + ". Ask me to make that change again.";
    }

    public static String syntaxNotice(List<SyntaxCheck.Problem> problems) {
        SyntaxCheck.Problem first = problems.getFirst();
        String more = problems.size() == 1 ? "" : " (and " + (problems.size() - 1) + " more like it)";
        return "Heads up: " + first.path() + " has a syntax error on line " + first.line() + " - "
                + first.message().replaceFirst("\\.$", "") + more
                + ". The preview will show an error until that is fixed - ask me to fix it.";
    }

    public static String typeNotice(List<TypeProblem> problems) {
        TypeProblem first = problems.getFirst();
        String more = problems.size() == 1 ? "" : " (and " + (problems.size() - 1) + " more like it)";
        return "Heads up: the code check found a problem I couldn't fix in " + first.describe().replaceFirst("\\.$", "")
                + more + ". The preview may show an error until that is fixed - ask me to fix it.";
    }

    public static String unresolvedNotice(List<ProjectImports.Problem> problems) {
        ProjectImports.Problem first = problems.getFirst();
        String more = problems.size() == 1 ? "" : " (and " + (problems.size() - 1) + " more like it)";
        return "Heads up: " + first.describe().replaceFirst("\\.$", "") + more
                + ". The preview will show an error until that is fixed - ask me to fix it.";
    }
}
