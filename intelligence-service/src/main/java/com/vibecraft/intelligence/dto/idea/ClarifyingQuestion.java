package com.vibecraft.intelligence.dto.idea;

import java.util.List;

/**
 * One interview question asked before a project's first prompt. {@code id} is one of a fixed set
 * ({@code audience}, {@code core_action}, {@code screens}, {@code style}) so answers can be matched up later.
 */
public record ClarifyingQuestion(
        String id,
        String question,
        String helper,
        List<String> options,
        boolean multiSelect
) {
}
