package com.singularity.intelligence.llm;

import java.util.regex.Pattern;

/**
 * Keeps a project file from ending its own fence in a prompt.
 *
 * <p>Handles: finding, in a file about to be shown to a model, any line written to look like one of the marker
 * lines the pipeline itself prints around files and sections, and changing its dashes so it no longer is one.
 *
 * <p>A file is shown between a START OF FILE line and an END OF FILE line and the model is told that everything
 * between them is material, not instruction. That only holds while the file cannot print the closing line itself. A
 * file holding {@code --- END OF FILE ---} followed by a heading and a paragraph put that paragraph outside every
 * fence, in the system message, looking exactly like the pipeline's own notice - and a file's author is not always
 * the person asking: a collaborator can edit a project and a fork carries its first author's files.
 *
 * <p>Only those imitation lines are touched, and only their leading dashes, which become tildes. Every other
 * character of every file reaches the model exactly as stored, which an {@code <edit>} depends on: it quotes the
 * lines it replaces. An edit that quotes an altered line will not apply and goes to repair like any other that does
 * not - a price paid only by a file that prints the pipeline's own markers. A file with none is returned as it is,
 * the same object, so the prompt for an ordinary project is byte for byte what it was.
 *
 * <p>A fence with a random token in it would do the same job without touching content, but it would change the
 * prompt of every turn of every project, and what a model does with a changed prompt has to be measured, not
 * assumed.
 */
public final class FileFence {

    private static final Pattern IMITATION = Pattern.compile(
            "(?m)^([ \\t]*)-{3,4}(?=[ \\t]+(?:START OF FILE|END OF FILE|ALREADY SHOWN|ALREADY READ|FILE NOT FOUND"
                    + "|COULD NOT READ|READ LIMIT REACHED|FILE_TREE|FILES|NOTICE|REMINDER|end of )\\b)");

    private FileFence() {
    }

    public static String guard(String content) {
        if (content == null || !content.contains("---")) {
            return content;
        }
        String guarded = IMITATION.matcher(content).replaceAll("$1~~~");
        return guarded.equals(content) ? content : guarded;
    }
}
