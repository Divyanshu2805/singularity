package com.singularity.intelligence.dto.chat;

import com.singularity.intelligence.enums.ChatEventType;

/**
 * One step of an assistant turn, as the chat renders it.
 *
 * <p>Handles: the event type and its content, the file it concerns where there is one, its place in the turn, and the
 * lesson and the "try changing this" task already written about a file edit, where there are ones, and whether the task
 * has been done. The file's previous version is not sent: only the
 * last turn's diffs are shown, and those have their own endpoint.
 */
public record ChatEventResponse(
        Long id,
        ChatEventType type,
        Integer sequenceOrder,
        String content,
        String filePath,
        String metadata,
        String lesson,
        String task,
        boolean taskDone
) {
}
