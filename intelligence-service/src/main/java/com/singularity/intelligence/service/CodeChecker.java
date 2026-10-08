package com.singularity.intelligence.service;

import com.singularity.common.dto.CodeCheckResponse;

import java.util.Map;
import java.util.Set;

/**
 * Asks for a build turn's files to be type-checked where the project's packages are installed.
 *
 * <p>Handles: one question - given the files a turn wrote and the paths it deletes, what does a compiler make of the
 * project as the turn would leave it - and an answer that is either what it found or that no check was made.
 *
 * <p>It never throws and never blocks a turn: whatever goes wrong on the way is "not checked". The check reads the
 * turn's files and writes nothing to the project, so the build turn is given this and not the workspace client.
 */
public interface CodeChecker {

    CodeCheckResponse check(Long projectId, Map<String, String> written, Set<String> deleted);
}
