package com.vibecraft.workspace.service;

import com.vibecraft.workspace.dto.code.CodeSearchResponse;
import com.vibecraft.workspace.dto.project.FileContentResponse;
import com.vibecraft.workspace.dto.project.FileTreeResponse;
import com.vibecraft.workspace.dto.project.ProjectZipResult;

/**
 * A project's files: metadata in the database, bytes in object storage.
 *
 * <p>Handles: the file tree, reading and writing one file, deleting one, copying every file of one project into
 * another for a fork, building a ZIP of the whole project, and plain-text search across it.
 *
 * <p>The tree and content reads carry no caller-based guard on purpose - the internal API reaches them as a machine
 * caller with no user id, so the browser-facing guard sits on the controller instead. Deleting a file that does not
 * exist is a no-op, so a model repeating a delete, or a retried turn, is harmless.
 */
public interface ProjectFileService {
    FileTreeResponse getFileTree(Long projectId);

    FileContentResponse getFileContent(Long projectId, String path);

    void saveFile(Long projectId, String filePath, String fileContent);

    void deleteFile(Long projectId, String filePath);

    int copyAllFiles(Long sourceProjectId, Long targetProjectId);

    ProjectZipResult buildProjectZip(Long projectId);

    CodeSearchResponse searchFiles(Long projectId, String query);
}
