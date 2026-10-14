package com.singularity.intelligence.service;

import java.util.Optional;

/**
 * Titles a project that has no title yet.
 *
 * <p>Handles: one operation - the project's title, written by a model from the first thing the caller asked for on it
 * and stored, or the one it already has; empty when there is nothing to write it from or nothing to spend.
 */
public interface ProjectTitleService {

    Optional<String> title(Long projectId);
}
