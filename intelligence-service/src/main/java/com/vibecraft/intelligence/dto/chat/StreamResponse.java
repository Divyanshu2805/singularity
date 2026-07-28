package com.vibecraft.intelligence.dto.chat;

/**
 * One chunk of a streamed answer.
 *
 * <p>Handles: the text, which is also how an error event carries its message.
 */
public record StreamResponse(String text) {}
