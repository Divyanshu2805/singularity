package com.vibecraft.intelligence.dto.idea;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * An idea plus the interview answers, to be turned into a brief.
 *
 * <p>Handles: both, each bounded in size.
 */
public record CompileIdeaRequest(

        @NotBlank(message = "Describe what you want to build")
        @Size(max = 4000, message = "Idea should not be more than 4000 characters long")
        String idea,

        @NotNull(message = "Answers are required (use an empty list if every question was skipped)")
        @Size(max = 10, message = "At most 10 answered questions can be compiled")
        List<@Valid IdeaAnswer> answers
) {
}
