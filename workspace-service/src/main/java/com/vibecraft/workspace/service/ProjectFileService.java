package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.code.CodeSearchResponse;
import com.vibecraft.workspace.dto.project.FileContentResponse;
import com.vibecraft.workspace.dto.project.FileTreeResponse;


public interface ProjectFileService {
    FileTreeResponse getFileTree(Long projectId);

    FileContentResponse getFileContent(Long projectId, String path);

    void saveFile(Long projectId, String filePath, String fileContent);

    /**
     * Removes a file from storage and from the project's file list. Deleting a file that doesn't exist is a no-op,
     * so a model repeating a delete (or a retried turn) is harmless.
     */
    void deleteFile(Long projectId, String filePath);

    /**
     * Copies every file of one project into another, inside storage (bytes are never downloaded, so images and other
     * binaries come through intact). A file listed but missing from storage is skipped, as the ZIP download does.
     *
     * @return how many files couldn't be copied for any other reason
     */
    int copyAllFiles(Long sourceProjectId, Long targetProjectId);

    byte[] buildProjectZip(Long projectId);

    /** Plain-text (not regex) search across every text file in the project, case-insensitive. */
    CodeSearchResponse searchFiles(Long projectId, String query);
}
