package com.vibecraft.intelligence.dto.chat;

import com.vibecraft.intelligence.enums.ChatEventType;

/**
 * One step of an assistant turn, as the chat renders it.
 *
 * <p>Handles: the event type and its content, the file it concerns where there is one, its place in the turn, and the
 * file's previous version so the editor can show that step's diff.
 */
public record ChatEventResponse(
        Long id,
        ChatEventType type,
        Integer sequenceOrder,
        String content,
        String filePath,
        String metadata
) {
}
