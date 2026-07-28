package com.vibecraft.intelligence.dto.idea;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * What someone picked or typed for one interview question.
 *
 * <p>Handles: the question it answers and the answers themselves, capped in number and length. An empty list means
 * the question was skipped.
 */
public record IdeaAnswer(

        @NotBlank(message = "Question id is required")
        @Size(max = 50, message = "Question id should not be more than 50 characters long")
        String questionId,

        @NotBlank(message = "Question text is required")
        @Size(max = 300, message = "Question should not be more than 300 characters long")
        String question,

        @NotNull(message = "Answers are required (use an empty list for a skipped question)")
        @Size(max = 10, message = "A question can have at most 10 answers")
        List<@NotBlank(message = "An answer can't be blank")
             @Size(max = 300, message = "An answer should not be more than 300 characters long") String> answers
) {
}
