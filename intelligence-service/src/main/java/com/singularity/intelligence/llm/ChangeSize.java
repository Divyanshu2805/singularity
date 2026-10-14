package com.singularity.intelligence.llm;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Tells a small change to an app that already exists - a rename, a restyle, text moved or taken out, a question about
 * the code - from everything else a build turn may be asked for.
 *
 * <p>Handles: reading a request's own words, without a model, and saying whether it is small enough to be sent with
 * the short edit prompt, the project's likeliest files rather than all of them, and the edit call's model.
 *
 * <p>It exists because of what a rename cost. Every build call sent the whole build prompt - thirty-three thousand
 * characters on scope, design, a project's server and how to plan a first build - and every source file of the
 * project, to change two lines. None of that prompt is about changing two lines, and a request to call the habits
 * "routines" needs the files that say "habits", not the hook that stores them.
 *
 * <p>It is deliberately narrow, because a wrong "small" is the expensive mistake: a feature sent down the short path
 * is written with less of the prompt in front of it and by a lighter model. So a request is small only when it is
 * short, is not a brief, names a change that alters what is already there (rename, recolour, resize, move, hide,
 * remove, reword) or asks about the code, and has none of the words that mean new behaviour (add, let me, save,
 * share, page with, server...). Anything in doubt is a build. Whether the project has been built at all is decided
 * by {@link ProjectBrief}, which can see its files: a new project is never a small change.
 */
public final class ChangeSize {

    static final int MAX_SMALL_REQUEST_CHARS = 240;

    private static final Pattern SMALL = Pattern.compile(
            "\\b(rename|renamed|call (it|them|the app|this)|instead of|re-?colou?r|restyle|typo|spelling|reword|"
                    + "wording|swap|move|hide|remove|delete|get rid of|take out|replace|"
                    + "(make|change|set|turn|use|put)\\b.{0,60}\\b(name|title|heading|label|text|words?|colou?rs?|"
                    + "font|bigger|smaller|larger|bold|italic|size|spacing|padding|margin|gap|background|border|"
                    + "rounded|shadow|icon|monospace|uppercase|lowercase|centered|centred|left|right|darker|lighter))\\b");
    private static final Pattern QUESTION = Pattern.compile(
            "^(how|where|what|why|which|when|who|is|are|does|do)\\b[^\\n]*\\?\\s*$");
    private static final Pattern NEW_BEHAVIOUR = Pattern.compile(
            "\\b(add|adds|adding|let me|let users|allow|able to|create|build|new (page|screen|feature|section|tab)|"
                    + "save|store|remember|persist|share|shared|server|backend|database|api|login|log in|sign|"
                    + "upload|download|export|import|filter|search|sort|chart|graph|notification|timer|drag|toggle|"
                    + "dark (mode|theme)|package|install|animate|animation|multiplayer|leaderboard)\\b");

    private ChangeSize() {
    }

    public static boolean looksSmall(String request) {
        if (request == null) {
            return false;
        }
        String text = request.strip();
        if (text.isEmpty() || text.length() > MAX_SMALL_REQUEST_CHARS || text.startsWith("**Build:**")) {
            return false;
        }
        String lowered = text.toLowerCase(Locale.ROOT);
        if (QUESTION.matcher(lowered).matches()) {
            return true;
        }
        return SMALL.matcher(lowered).find() && !NEW_BEHAVIOUR.matcher(lowered).find();
    }
}
