package com.vibecraft.intelligence.dto.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One earlier turn of a code conversation, replayed by the client on each request. The thread is deliberately
 * never stored server-side (see {@code CodeInsightService}), so the client is the only place it lives.
 *
 * <p>{@code role} is validated rather than trusted: it goes straight into the model's message list, and a
 * client sending "system" could otherwise smuggle in instructions.
 */
public record CodeChatTurn(

        @NotBlank(message = "Turn role is required")
        @Size(max = 20, message = "Turn role should not be more than 20 characters long")
        String role,

        @NotBlank(message = "Turn content is required")
        @Size(max = 4000, message = "Turn content should not be more than 4000 characters long")
        String content
) {
    public boolean isAssistant() {
        return "assistant".equalsIgnoreCase(role == null ? "" : role.strip());
    }
}
