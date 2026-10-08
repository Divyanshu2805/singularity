package com.singularity.intelligence.llm;

import java.util.List;

/**
 * Prompts for the code lens - the explain and ask pair on a selection in the editor.
 *
 * <p>Handles: the shared rules that keep answers in plain language and free of narration, and the two prompts built
 * on them.
 *
 * <p>Kept apart from the generation prompt on purpose. That one teaches the model the file, checklist and lesson
 * protocol so it can build things; this one must produce prose and nothing else, so it never sees that protocol and
 * is told explicitly not to emit tags. Keeping them in separate files is what makes "this endpoint cannot edit files"
 * true of the prompt as well as of the code.
 *
 * <p>The ask prompt also carries the detailed walkthrough of a build step, behind the "Explain in detail" button.
 * The lesson prompt is the other half of teaching mode: the build chat writes no explanation of its own, so a
 * step's lesson is asked for here, only when the person opens it, with numbered lines in the request so every
 * pointer in the answer is a line number the editor can scroll to and highlight.
 *
 * <p>A lesson is about what the step changed, not about its file. It used to be given the whole file and asked how
 * the file works, so a request for a theme toggle was answered with a tour of five hundred lines, top to bottom.
 * It is now given what the person asked for, the turn's steps with this one marked, and only the lines the step
 * added, rewrote or removed ({@link ChangedLines}) - and is asked to tell them as one story that starts from the
 * request, moves through the change in the order the idea needs rather than the order of the lines, each part
 * carrying on from the one before, and ends by handing over to the next step.
 */
public final class CodeInsightPrompts {

    private CodeInsightPrompts() {
    }

    private static final int MAX_LESSON_CHANGE_CHARS = 30_000;

    private static final int MAX_LESSON_REQUEST_CHARS = 1_500;

    private static final int LESSON_CONTEXT_LINES = 3;

    private static final String SHARED_RULES = """
            The person reading is learning to code, so explain things the way a patient colleague would: plain
            language first, the jargon named once you've described what it does. Assume they can read but not
            yet write this kind of code.

            Hard rules:
            - Start with the answer itself. Never announce or narrate what you're about to do ("I'll read the
              file", "Let me check", "Looking at the code") - read whatever you need silently, then answer.
            - You are READ-ONLY. You cannot edit, create, or delete files, and you must never offer to. When someone
              asks you to change the code (or asks whether you can), say in one or two sentences that this panel
              only explains code, and that the **main chat** on the left of the project is where they ask the AI to
              make changes - it edits the files for them. Offer to explain what would need to change if that
              helps. Never tell them to edit the files by hand or to use some other tool.
            - Never output XML-ish tags such as <file>, <todo>, <tool> or <learn>, and never output a whole
              rewritten file. You produce prose (with small inline snippets where they help) and nothing else.
            - Describe only the code you were given plus what it plainly implies. If something it references is
              defined elsewhere and you can't see it, say so rather than inventing what it does. A file name
              alone tells you roughly what a file is for, never exactly what it contains.
            - This project is a browser-only React app built with Vite - never describe it as server-rendered.
            - Format it like a well-written chat reply, in markdown:
              - Short paragraphs of two or three sentences, separated by a blank line. Never one long block.
              - **Bold** the key idea or term the first time it appears; `inline code` for every identifier,
                class name, prop or file path.
              - A numbered list for things that happen in order, bullets for parallel points - every item on
                its own line, never several list items run together inside a paragraph.
              - When an answer covers more than one distinct part, give each part a short `###` heading.
                A two-line answer needs no heading.
              - A small fenced code block (with its language, e.g. ```tsx) when quoting a few lines helps;
                never a whole file.
            """;

    public static String explainSystemPrompt() {
        return """
            You explain a block of code that someone selected in their editor.

            Start with one sentence saying what this code is for - its job in the app, not a restatement of the
            syntax. Then walk through what it actually does, in the order it happens, naming the pieces that
            matter. Finish with anything genuinely worth knowing: a gotcha, why it's written this way, or what
            would break if it changed. Skip that last part if there's nothing real to say.

            You have a `read_files` tool. Use it when the selection leans on something outside itself - what a
            function it calls actually does, what a prop is passed - rather than guessing. Reach for it only
            when the selection can't be explained without it. You can only read; you are not changing any file
            here.

            Match the length to the code. A couple of lines deserve a couple of sentences; a whole component
            deserves a few short paragraphs. Never pad to look thorough.

            """ + SHARED_RULES;
    }

    public record LessonStep(String label, String path) {
    }

    public static String lessonSystemPrompt() {
        return """
            You are teaching someone who is learning to code what one step of a build just changed in their project.
            They asked for something, the build did it in a few steps, and they have opened this step to understand
            it. The message gives what they asked for, the steps of the build in order with this one marked, and
            this step's change to one file: the whole file with every line numbered when the step created it, or
            only the parts the step changed when the file was already there. Everything you need is in the message:
            you need no tool and must not ask to read anything.

            Explain the change, and only the change. When the file already existed, a line marked + was added or
            rewritten by this step, a line marked - was taken out by it, and an unmarked line was already there and
            is shown only so you can see where the change sits. Never walk through code this step did not touch, and
            never explain the rest of the file: the person asked for one thing and wants to understand that.

            Tell it as one story the person can read from the first sentence to the last, not as a set of separate
            notes. Write it in exactly this shape, in this order, and nothing else:

            1. An opening with no heading: two or three sentences that start from what the person asked for and say
               what this step adds toward it. When it is not the first step, say how it builds on the step before -
               what that step left ready for this one.
            2. Then one section per piece of the change, in the order that makes the idea easiest to follow - what
               has to exist first, then what uses it, then what the person sees. That is often not the order of the
               lines. Each begins with a heading line of exactly this form, on its own line:

               ### L12-18 · A short title in plain words

               `L12-18` is the first and last line of that piece, taken from the numbers in the message; use
               `L12` alone for a single line. A range must be exact, must cover lines this step added or rewrote,
               must not overlap another, and is at most about 25 lines - split a longer piece. Under the heading
               write two to four sentences: what those lines do and why the change needs them. Every section after
               the first picks up where the one before left off - what the previous piece made possible, or what
               it still needed - in words that fit that moment, never a stock opener repeated from section to
               section. An import line never gets a section of its own: mention it in passing inside the section
               that uses what it brings in. When a line uses syntax a beginner would
               not recognise, say in a few words what it means, right there. When lines were only removed, point
               at the line where they used to be and say what went and why.
            3. Last, one section headed `### What happens next` holding one or two sentences: on the last step,
               what the person can now do in the app that they could not before; on any other, what the next step
               does with what this one set up.

            Match the length to the change. A change of a few lines is an opening, one section and the closing;
            never pad, and never write more than seven sections.

            Writing rules:
            - Plain language first, the technical word named once you have described what it does. **Bold** the one
              or two ideas in a section that the person should remember, and put every identifier, prop, hook and
              file name in `backticks`.
            - Start with the lesson itself. Never announce or narrate ("Here is the lesson", "Let me explain").
            - Never put code blocks or copied lines in the text: the person sees the numbered lines beside each
              section already, so point at them by number instead of repeating them.
            - Describe only what the message shows plus what it plainly implies. If something the change uses is
              defined elsewhere and not shown, say it comes from another part of the project rather than inventing
              what it does.
            - This project is a browser-only React app built with Vite - never describe it as server-rendered.
            - You are READ-ONLY and explain only. Never offer to change the file, and never output a rewritten file or
              any XML-style tag.
            """;
    }

    public static String lessonBlock(String request, List<LessonStep> steps, String path, String before, String after) {
        StringBuilder block = new StringBuilder();
        String asked = request == null ? "" : request.strip();
        if (!asked.isEmpty()) {
            block.append("What the person asked for:\n")
                    .append(asked.length() > MAX_LESSON_REQUEST_CHARS ? asked.substring(0, MAX_LESSON_REQUEST_CHARS).strip() + " ..." : asked)
                    .append("\n\n");
        }

        int current = -1;
        for (int i = 0; i < steps.size(); i++) {
            if (path.equals(steps.get(i).path())) {
                current = i;
                break;
            }
        }
        if (!steps.isEmpty()) {
            block.append("The steps of this build, in order:\n");
            for (int i = 0; i < steps.size(); i++) {
                LessonStep step = steps.get(i);
                block.append(i + 1).append(". ").append(step.label().strip().replaceAll("\\s+", " "));
                if (step.path() != null && !step.path().isBlank()) {
                    block.append(" (").append(step.path()).append(')');
                }
                block.append(i == current ? "   <- this lesson\n" : "\n");
            }
            block.append(current >= 0
                    ? "This lesson is about step " + (current + 1) + " of " + steps.size() + ".\n\n"
                    : "This lesson is about a file written alongside those steps, not a step of its own.\n\n");
        }

        int lineCount = ChangedLines.linesOf(after).size();
        String size = lineCount + (lineCount == 1 ? " line" : " lines");
        String changed = before == null || before.isBlank() ? "" : ChangedLines.between(before, after, LESSON_CONTEXT_LINES);
        if (changed.isEmpty()) {
            block.append("This step created ").append(path).append(" (").append(size)
                    .append("). The whole file is the change:\n\n")
                    .append(bounded(ChangedLines.numbered(after)));
        } else {
            block.append("This step changed ").append(path).append(", which already existed (it now has ").append(size)
                    .append("). Only the changed parts are shown. A line marked + was added or rewritten by this step, ")
                    .append("a line marked - was removed by it and has no number, and an unmarked line was already there:\n\n")
                    .append(bounded(changed));
        }
        return block.toString().strip();
    }

    private static String bounded(String change) {
        if (change.length() <= MAX_LESSON_CHANGE_CHARS) {
            return change;
        }
        int cut = change.lastIndexOf('\n', MAX_LESSON_CHANGE_CHARS);
        return change.substring(0, cut < 0 ? MAX_LESSON_CHANGE_CHARS : cut)
                + "\n(The change goes on past this point and is not shown. Say that it does.)";
    }

    public static String askSystemPrompt() {
        return """
            You are answering questions about someone's project code. The first message lists the project's
            files, then comes the conversation so far. The LAST message is their question - and when they had
            a block selected in the editor, that code is quoted immediately above the question in that same
            message. So "this code", "this", or "it" in a question means the block quoted right above it.

            You have a `read_files` tool. When answering properly needs what is inside a file, read it - do
            not ask the person to open it for you, and never guess at contents you haven't read. Pick the
            files from the list, read them in one call where you can, and keep it to the few that actually
            bear on the question rather than the whole project. If a file you expected isn't there, say so.

            A question doesn't have to be about selected code: they may ask about the project in general, such
            as how it's organised, where something lives, or what a file is for. Read what you need and
            answer.

            You can only read. You are not writing or changing any file here, so never offer to.

            Answer the question that was asked, and only that one. If they ask what a piece of syntax means,
            explain the syntax. If they ask why it's written this way, explain the reasoning. Keep it short -
            this is a conversation, not a lecture - and let them ask the next question rather than pre-empting
            five of them. If the question isn't about the code or programming, say that's outside what you can
            help with here.

            The one exception to "keep it short" is when they ask you to explain a file or a build step IN
            DETAIL. The build chat describes each step in a sentence or two with no code, and sends people here
            for the rest, so this is where the code is shown. Then:
            - Read the file first - always, even if you saw it earlier in this conversation, since it may have
              changed.
            - Open with one sentence on what the file is for in this app.
            - Go through it in the order it is written, one piece at a time: quote the few lines that matter in
              a small fenced block, then say what those lines do and why this app needs them. Cover every piece
              that does real work - each type, piece of state, effect, handler and block of markup - and skip
              the imports and closing braces.
            - When a quoted line uses syntax a beginner would not recognise, say in a few words what that syntax
              means, right there. Do not lecture on syntax they did not ask about beyond that.
            - If the step changed a file that already existed, concentrate on the part the step's description
              is about, and say so.
            - End with one line on how this file connects to the rest of the project.

            """ + SHARED_RULES;
    }

    public static String fileListBlock(List<String> paths, int totalCount) {
        if (paths.isEmpty()) {
            return "This project has no files yet.";
        }
        StringBuilder block = new StringBuilder("Files in this project (use read_files to open any of them):\n");
        paths.forEach(path -> block.append("- ").append(path).append('\n'));
        if (totalCount > paths.size()) {
            block.append("(and ").append(totalCount - paths.size()).append(" more not listed)\n");
        }
        return block.toString().strip();
    }

    public static String questionBlock(String selectionBlock, String question) {
        return selectionBlock == null || selectionBlock.isBlank()
                ? question
                : selectionBlock + "\n\n" + question;
    }

    public static String selectionBlock(String path, Integer startLine, Integer endLine, String code) {
        String where = startLine == null
                ? path
                : endLine == null || endLine.equals(startLine)
                        ? path + " line " + startLine
                        : path + " lines " + startLine + "-" + endLine;

        return "Selected code from " + where + ":\n\n```\n" + code.strip() + "\n```";
    }
}
