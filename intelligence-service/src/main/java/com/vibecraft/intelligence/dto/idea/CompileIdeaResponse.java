package com.vibecraft.intelligence.dto.idea;

/**
 * The project brief compiled from an idea and its interview answers.
 *
 * <p>Handles: the brief, which is sent as the project's first chat message.
 */
public record CompileIdeaResponse(
        String spec
) {
}
