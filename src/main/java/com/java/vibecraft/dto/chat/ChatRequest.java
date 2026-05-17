package com.java.vibecraft.dto.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ChatRequest(
        @NotBlank(message = "Message must not be blank")
        String message,

        @NotNull(message = "Project id is required")
        Long projectId
) {}
