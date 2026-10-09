package com.singularity.intelligence.dto.code;

import com.singularity.intelligence.enums.LearnerLevel;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A term to be defined for the caller's glossary.
 *
 * <p>Handles: the term as the person met it and how much code the reader knows. The term is short free text from the
 * browser, so it is cut to one line and a fixed length before it is used, and reaches the model only as the word to
 * define in a user message, never in the system prompt. Read-only: nothing here can change a file.
 */
public record GlossaryRequest(

        @NotBlank(message = "The term is required")
        @Size(max = 200, message = "The term is too long")
        String term,

        LearnerLevel level
) {
}
