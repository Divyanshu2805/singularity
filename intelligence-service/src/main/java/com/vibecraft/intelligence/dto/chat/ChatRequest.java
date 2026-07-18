package com.vibecraft.intelligence.dto.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ChatRequest(
        @NotBlank(message = "Message must not be blank")
        String message,

        @NotNull(message = "Project id is required")
        Long projectId,

        // Optional: explain the concepts behind each file as it's built. Absent or null means off, so clients that
        // predate teaching mode keep working unchanged. Boxed on purpose - a missing primitive is a Jackson error.
        Boolean teachingMode
) {}
