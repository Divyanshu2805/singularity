package com.singularity.intelligence.service;

import java.util.List;

/**
 * Suggests what the caller might ask for next on a project.
 *
 * <p>Handles: one operation - up to three short build requests that follow on from the caller's last finished build,
 * or none when there is nothing to go on or nothing to spend.
 */
public interface SuggestionService {

    List<String> nextSteps(Long projectId);
}
