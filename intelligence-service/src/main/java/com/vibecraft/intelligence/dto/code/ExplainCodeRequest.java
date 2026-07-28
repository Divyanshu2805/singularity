package com.vibecraft.intelligence.dto.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * A selected block of code to explain in plain language.
 *
 * <p>Handles: the file, the code and its line range, each length-bounded. Read-only: nothing here can change a file.
 */
public record ExplainCodeRequest(

        @NotBlank(message = "File path is required")
        @Size(max = 500, message = "File path should not be more than 500 characters long")
        String path,

        @NotBlank(message = "Select some code to explain")
        @Size(max = 12000, message = "Select a smaller block of code - at most 12000 characters")
        String code,

        Integer startLine,

        Integer endLine
) {
}
