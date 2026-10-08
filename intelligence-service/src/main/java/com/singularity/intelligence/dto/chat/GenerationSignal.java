package com.singularity.intelligence.dto.chat;

/**
 * One thing a build turn tells whoever is watching it.
 *
 * <p>Handles: the four kinds - a piece of the answer's text as it is written, a line saying what the server is doing
 * between pieces (reading files, carrying on a reply that stopped early, saving), the whole text again when the server
 * has had to cut something out of it, and the outcome once the turn has been saved.
 *
 * <p>The outcome is the last signal a watcher receives, and it is sent only after the turn is in the database, so a
 * client that reloads the conversation on it always finds the turn there. Before this existed a watcher's stream
 * ended when the model stopped writing, well before anything was saved, and the browser was left showing its own
 * reading of the text - including files the server had not kept.
 */
public record GenerationSignal(Kind kind, String text) {

    public enum Kind {
        TEXT,
        STATUS,
        REPLACE,
        DONE
    }

    public static GenerationSignal text(String chunk) {
        return new GenerationSignal(Kind.TEXT, chunk);
    }

    public static GenerationSignal status(String line) {
        return new GenerationSignal(Kind.STATUS, line);
    }

    public static GenerationSignal replace(String wholeText) {
        return new GenerationSignal(Kind.REPLACE, wholeText);
    }

    public static GenerationSignal done(String outcome) {
        return new GenerationSignal(Kind.DONE, outcome);
    }
}
