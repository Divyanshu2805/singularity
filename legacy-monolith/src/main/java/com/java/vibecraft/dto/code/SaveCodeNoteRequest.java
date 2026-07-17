package com.java.vibecraft.dto.code;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * One finished exchange to keep, sent once the answer has finished streaming - the stream itself can't save
 * it, since a reply the reader stopped or lost halfway isn't worth keeping.
 */
public record SaveCodeNoteRequest(

        @NotBlank(message = "The question is required")
        @Size(max = 2000, message = "Question should not be more than 2000 characters long")
        String question,

        @NotBlank(message = "The answer is required")
        @Size(max = 60000, message = "Answer should not be more than 60000 characters long")
        String answer,

        @Valid
        CodeNoteSelection selection
) {
}
