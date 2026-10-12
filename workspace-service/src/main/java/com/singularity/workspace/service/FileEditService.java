package com.singularity.workspace.service;

import com.singularity.workspace.dto.project.CreateFileRequest;
import com.singularity.workspace.dto.project.SaveFileRequest;
import com.singularity.workspace.dto.project.SaveFileResponse;

/**
 * Changing one project file by hand.
 *
 * <p>Handles: saving new text for a file that already exists, adding a new empty file, and removing a file - each
 * as a revision like any other write.
 */
public interface FileEditService {

    SaveFileResponse saveFile(Long projectId, SaveFileRequest request, Long userId);

    SaveFileResponse createFile(Long projectId, CreateFileRequest request, Long userId);

    Long deleteFile(Long projectId, String path, Long userId);
}
