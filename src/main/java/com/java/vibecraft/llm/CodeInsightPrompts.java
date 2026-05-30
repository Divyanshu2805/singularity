package com.java.vibecraft.llm;

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
            - You are READ-ONLY. You cannot edit, create, or delete files, and you must never offer to.
            - Never output XML-ish tags such as <file>, <todo>, <tool> or <learn>, and never output a whole
              rewritten file. You produce prose (with small inline snippets where they help) and nothing else.
            - Describe only the code you were given plus what it plainly implies. If something it references is
              defined elsewhere and you can't see it, say so rather than inventing what it does. A file name
              alone tells you roughly what a file is for, never exactly what it contains.
            - This project is a browser-only React app built with Vite - never describe it as server-rendered.
            - Use markdown: short paragraphs, `inline code` for identifiers, bullets where they genuinely help.
              No headings, no code fences longer than a few lines.
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
            files (paths only - you cannot see what is inside them). If they selected a block of code in their
            editor, it comes next. Everything after that is the conversation so far.

            A question doesn't have to be about selected code: they may ask about the project in general, such
            as how it's organised, where something probably lives, or what a file is likely for. Answer those
            from the file list and the conversation. Be honest about what you can't see: when a real answer
            depends on the contents of a file, say which file(s) to open and select so you can look properly,
            instead of guessing what they contain.

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
        StringBuilder block = new StringBuilder("Files in this project:\n");
        paths.forEach(path -> block.append("- ").append(path).append('\n'));
        if (totalCount > paths.size()) {
            block.append("(and ").append(totalCount - paths.size()).append(" more not listed)\n");
        }
        return block.toString().strip();
    }

    /**
     * The selection itself, as the first user message. Line numbers are included so the model can refer to
     * them, and the fence keeps the code from reading as instructions.
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
