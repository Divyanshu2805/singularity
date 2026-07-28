package com.vibecraft.intelligence.dto.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * A message to the build chat.
 *
 * <p>Handles: the message, the project it is about, and whether teaching mode is on for this turn. The teaching
 * toggle is per request - nothing about it is stored.
 */
public record ChatRequest(
        @NotBlank(message = "Message must not be blank")
        String message,

        @NotNull(message = "Project id is required")
        Long projectId,

        Boolean teachingMode
) {}
