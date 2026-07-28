package com.vibecraft.intelligence.dto.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One earlier turn of a code conversation, replayed by the client on each request.
 *
 * <p>Handles: the role and the text. The thread is deliberately never stored server-side, so the client is the only
 * place it lives.
 *
 * <p>The role is validated by value rather than trusted: it goes straight into the model's message list, and a client
 * sending "system" could otherwise smuggle in instructions. Any new endpoint that replays client-supplied history
 * needs the same by-value check, not just a length cap.
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
