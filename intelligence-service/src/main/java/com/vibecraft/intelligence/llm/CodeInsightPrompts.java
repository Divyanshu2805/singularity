package com.vibecraft.intelligence.llm;

import java.util.List;

/**
 * Prompts for the code lens - the "Explain"/"Ask" pair on a selection in the editor.
 *
 * <p>Kept apart from {@link PromptUtils} on purpose. That prompt teaches the model the {@code <file>} /
 * {@code <todo>} / {@code <learn>} protocol so it can build things; this one must produce prose and nothing
 * else, so it never sees that protocol and is told explicitly not to emit tags. Keeping them in separate
 * methods is what makes "this endpoint cannot edit files" true of the prompt as well as of the code.
 */
public final class CodeInsightPrompts {

    private CodeInsightPrompts() {
    }

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

    /**
     * The one-shot "Explain" button: a self-contained read of the selection, no conversation attached. The
     * shape is deliberately loose (no fixed section list) - a two-line selection and a forty-line component
     * need very different answers, and a template would pad the short one out.
     */
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

    /**
     * The "Ask" conversation: same voice, but answering the question actually asked. A question may come with
     * a selected block or without one - general questions about the project are just as welcome.
     */
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

            """ + SHARED_RULES;
    }

    /**
     * The project's file paths, as the first user message of a question. Paths only - no contents - so the
     * model can talk about how the project is laid out without anything being read from storage.
     */
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

    /**
     * The question as the final message, with the selected code quoted directly above it.
     *
     * <p>The selection used to be its own message ahead of the replayed conversation. A model reading
     * "what is this code?" then answered that it had no selection at all - by the time it reached the
     * question the block was several messages back, behind the whole history. Asking the way a person
     * would, code then question, removes the ambiguity.
     */
    public static String questionBlock(String selectionBlock, String question) {
        return selectionBlock == null || selectionBlock.isBlank()
                ? question
                : selectionBlock + "\n\n" + question;
    }

    /**
     * The selection itself. Line numbers are included so the model can refer to them, and the fence keeps the
     * code from reading as instructions.
     */
    public static String selectionBlock(String path, Integer startLine, Integer endLine, String code) {
        String where = startLine == null
                ? path
                : endLine == null || endLine.equals(startLine)
                        ? path + " line " + startLine
                        : path + " lines " + startLine + "-" + endLine;

        return "Selected code from " + where + ":\n\n```\n" + code.strip() + "\n```";
    }
}
