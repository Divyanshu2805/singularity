package com.vibecraft.intelligence.llm;

import java.util.List;

/**
 * Drops what a model says before it reads files, so a streamed answer starts with the answer.
 *
 * <p>Handles: holding back the start of each round, discarding it when a tool call follows (which means it was an
 * announcement), and releasing it once enough text has arrived or the stream has ended (which means it was the
 * answer).
 *
 * <p>With tools enabled the model often announces a lookup, calls the read tool, then answers. The announcement is
 * streamed straight through and the tool-call chunk never is, so the stream carries no marker of where the
 * announcement ends - it simply runs into the answer. The tool being invoked is the one reliable boundary.
 *
 * <p>The cost is that an answer's first few hundred characters appear together instead of trickling in, and narration
 * longer than that is not caught - the prompt is the defence there.
 */
public final class NarrationFilter {

    static final int HOLD_CHARS = 280;

    private final StringBuilder held = new StringBuilder();
    private boolean holding = true;

    public synchronized List<String> accept(String text) {
        if (text == null || text.isEmpty()) return List.of();
        if (!holding) return List.of(text);

        held.append(text);
        if (held.length() < HOLD_CHARS) return List.of();
        return release();
    }

    public synchronized void toolInvoked() {
        held.setLength(0);
        holding = true;
    }

    public synchronized List<String> finish() {
        return held.isEmpty() ? List.of() : release();
    }

    private List<String> release() {
        String out = held.toString();
        held.setLength(0);
        holding = false;
        return List.of(out);
    }
}
