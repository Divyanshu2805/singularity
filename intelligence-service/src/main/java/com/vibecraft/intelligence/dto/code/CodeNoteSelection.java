package com.vibecraft.intelligence.dto.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The block a saved question was about.
 *
 * <p>Handles: the file, the quoted code and the line range. Optional on a note - a question can be about the project
 * as a whole - but when it is present the file it came from is too.
 */
public record CodeNoteSelection(

        @NotBlank(message = "File path is required for a saved selection")
        @Size(max = 500, message = "File path should not be more than 500 characters long")
        String path,

        @NotBlank(message = "Selected code is required for a saved selection")
        @Size(max = 12000, message = "Select a smaller block of code - at most 12000 characters")
        String code,

        Integer startLine,

        Integer endLine
) {
}
