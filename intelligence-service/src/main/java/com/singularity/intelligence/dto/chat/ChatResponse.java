package com.singularity.intelligence.dto.chat;

import com.singularity.intelligence.enums.MessageRole;

import java.time.Instant;
import java.util.List;

/**
 * One saved turn of the build chat.
 *
 * <p>Handles: the role, the turn's events in order, its raw text where there is any, the tokens it cost and when it
 * happened, whether an assistant turn was asked for in teaching mode, and the big picture teaching mode wrote about
 * it once it has been shown. An assistant turn carries no text of its own - its events are the record. An assistant
 * turn whose files were saved carries the revision they were published as, which the browser hands back to undo that
 * turn.
 */
public record ChatResponse(
        Long id,
        MessageRole role,
        List<ChatEventResponse> events,
        String content,
        Integer tokensUsed,
        Instant createdAt,
        boolean teaching,
        String overview,
        Long revisionId

) {
}
