package com.vibecraft.intelligence.dto.chat;

import com.vibecraft.intelligence.enums.MessageRole;

import java.time.Instant;
import java.util.List;

/**
 * One saved turn of the build chat.
 *
 * <p>Handles: the role, the turn's events in order, its raw text where there is any, the tokens it cost and when it
 * happened. An assistant turn carries no text of its own - its events are the record.
 */
public record ChatResponse(
        Long id,
        MessageRole role,
        List<ChatEventResponse> events,
        String content,
        Integer tokensUsed,
        Instant createdAt

) {
}
