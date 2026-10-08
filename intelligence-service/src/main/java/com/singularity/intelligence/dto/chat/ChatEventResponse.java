package com.singularity.intelligence.dto.chat;

import com.singularity.intelligence.enums.ChatEventType;

/**
 * One step of an assistant turn, as the chat renders it.
 *
 * <p>Handles: the event type and its content, the file it concerns where there is one, its place in the turn, and the
 * lesson already written about a file edit, where there is one. The file's previous version is not sent: only the
 * last turn's diffs are shown, and those have their own endpoint.
 */
public record ChatEventResponse(
        Long id,
        ChatEventType type,
        Integer sequenceOrder,
        String content,
        String filePath,
        String metadata,
        String lesson
) {
}
