package com.java.vibecraft.dto.idea;

import java.util.List;

public record ClarifyIdeaResponse(
        List<ClarifyingQuestion> questions
) {
}
