package com.java.vibecraft.llm;

import java.util.List;

/**
 * Drops what a model says <em>before</em> it reads files - "I'll read the surrounding code so the explanation
 * matches..." - so a streamed answer starts with the answer.
 *
 * <p>With tools enabled the model often announces a lookup, calls {@code read_files}, then answers. Spring AI streams
 * that announcement straight through and never emits the tool-call chunk itself, so the stream carries no marker of
 * where the announcement ends; it just ran into the answer ("...actually there.This is the page header"). The one
 * reliable boundary is the tool being invoked, so the start of each round is held back: a tool call means what was
 * held was narration, and is discarded; enough text arriving (or the stream ending) means it was the answer, and is
 * released. The prompt forbids narrating as well - this is what makes it hold when the model does it anyway.
 *
 * <p>The cost is that an answer's first {@link #HOLD_CHARS} characters appear together instead of trickling in.
 * Narration longer than that is not caught; the prompt is the defence there.
 */
public final class NarrationFilter {

    /** Comfortably longer than a one-sentence "let me look at X" and short enough that holding it isn't noticeable. */
    static final int HOLD_CHARS = 280;

    private final StringBuilder held = new StringBuilder();
    private boolean holding = true;

    /** A chunk of model output; returns what may be shown now. */
    public synchronized List<String> accept(String text) {
        if (text == null || text.isEmpty()) return List.of();
        if (!holding) return List.of(text);

        held.append(text);
        if (held.length() < HOLD_CHARS) return List.of();
        return release();
    }

    /** The model is reading files: anything it said since the last release was an announcement of that. */
    public synchronized void toolInvoked() {
        held.setLength(0);
        // The next round starts after the tool result - hold its start too, in case it announces another read.
        holding = true;
    }

    /** The stream ended: whatever is held was a short answer that never needed a tool. */
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
