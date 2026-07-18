package com.vibecraft.intelligence.dto.idea;

import java.util.List;

public record ClarifyIdeaResponse(
        List<ClarifyingQuestion> questions
) {
}
