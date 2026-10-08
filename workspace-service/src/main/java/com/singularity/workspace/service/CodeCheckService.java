package com.singularity.workspace.service;

import com.singularity.common.dto.CodeCheckRequest;
import com.singularity.common.dto.CodeCheckResponse;

/**
 * Type-checks the files a build turn is about to save, in the project's running preview.
 *
 * <p>Handles: one operation - given the files a turn wrote and the paths it deletes, say what the TypeScript compiler
 * and the package registry make of the project as the turn would leave it, or that no check could be made.
 *
 * <p>It is called only from the internal API, as the build pipeline, which has already decided the turn's author may
 * edit the project. It changes nothing: not the stored files, not the preview's own copy of them.
 */
public interface CodeCheckService {

    CodeCheckResponse check(Long projectId, CodeCheckRequest request);
}
