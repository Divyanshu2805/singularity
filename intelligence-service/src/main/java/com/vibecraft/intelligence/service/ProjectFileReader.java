package com.vibecraft.intelligence.service;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.FileTreeDto;

/**
 * The read-only half of workspace-service's file API.
 *
 * <p>Handles: the file tree and one file's content, and deliberately nothing else - there is no save or delete
 * method.
 *
 * <p>Anything that must never write a file, above all the model-facing read tool, is given this type rather than the
 * full workspace client, so an edit that tried to add a write call inside it fails to compile instead of merely
 * failing a review.
 */
public interface ProjectFileReader {

    FileTreeDto getFileTree(Long projectId);

    FileContentDto getFileContent(Long projectId, String path);
}
