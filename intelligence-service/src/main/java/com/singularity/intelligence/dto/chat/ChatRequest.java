package com.singularity.intelligence.dto.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A message to the build chat.
 *
 * <p>Handles: the message, the project it is about, and whether teaching mode is on for this turn. The teaching
 * toggle is per request - nothing about it is stored.
 *
 * <p>The message is capped because it is replayed to the model with the conversation and every turn re-sends it: an
 * unbounded one lets a single request spend far more than a turn is ever reserved for. The chat box and the
 * runtime-error prompt stay under the same cap (frontend/src/components/ChatPanel.tsx, pages/ProjectView.tsx).
 */
public record ChatRequest(
        @NotBlank(message = "Message must not be blank")
        @Size(max = 16000, message = "Message should not be more than 16000 characters long")
        String message,

        @NotNull(message = "Project id is required")
        Long projectId,

        Boolean teachingMode
) {}
