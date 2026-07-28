package com.vibecraft.intelligence.dto.code;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.Valid;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * A question for the code notes, with the conversation so far replayed by the client.
 *
 * <p>Handles: the question, the optional selected block and the file it came from, and the earlier turns.
 *
 * <p>The selection is optional - a question can be about a block picked in the editor or about the project in general
 * - but when code is sent the file it came from must be too, so the answer can name where it lives.
 */
public record AskCodeRequest(

        @Size(max = 500, message = "File path should not be more than 500 characters long")
        String path,

        @Size(max = 12000, message = "Select a smaller block of code - at most 12000 characters")
        String code,

        Integer startLine,

        Integer endLine,

        @NotBlank(message = "Ask a question about the code")
        @Size(max = 2000, message = "Question should not be more than 2000 characters long")
        String question,

        @NotNull(message = "History is required (use an empty list for the first question)")
        @Size(max = 40, message = "At most 40 earlier turns can be replayed")
        List<@Valid CodeChatTurn> history
) {

    @JsonIgnore
    public boolean hasSelection() {
        return code != null && !code.isBlank();
    }

    @JsonIgnore
    @AssertTrue(message = "Selected code needs the path of the file it came from")
    public boolean isSelectionComplete() {
        return !hasSelection() || (path != null && !path.isBlank());
    }
}
