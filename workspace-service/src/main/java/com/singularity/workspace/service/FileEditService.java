package com.singularity.workspace.service;

import com.singularity.workspace.dto.project.SaveFileRequest;
import com.singularity.workspace.dto.project.SaveFileResponse;

/**
 * Changing one project file by hand.
 *
 * <p>Handles: saving new text for a file that already exists, as a revision like any other write.
 */
public interface FileEditService {

    SaveFileResponse saveFile(Long projectId, SaveFileRequest request, Long userId);
}
