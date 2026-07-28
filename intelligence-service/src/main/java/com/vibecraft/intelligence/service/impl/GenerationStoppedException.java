package com.vibecraft.intelligence.service.impl;

/**
 * Marks a generation the user stopped, as distinct from one that failed.
 *
 * <p>Handles: ending every viewer's stream with a message the client shows as-is, so another open tab stops too
 * rather than hanging.
 */
public class GenerationStoppedException extends RuntimeException {

    public GenerationStoppedException() {
        super("This response was stopped.");
    }
}
