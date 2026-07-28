package com.vibecraft.intelligence.dto.idea;

import java.util.List;

/**
 * One interview question asked before a project's first prompt.
 *
 * <p>Handles: the question, its helper line and its options. The id is one of a fixed set, so answers can be matched
 * up when the brief is compiled.
 */
public record ClarifyingQuestion(
        String id,
        String question,
        String helper,
        List<String> options,
        boolean multiSelect
) {
}
