package com.vibecraft.intelligence.service;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.FileTreeDto;

/**
 * The read-only half of workspace-service's file API - deliberately has no save/delete method. Anything that
 * must never write a file (the code-insight pipeline's model-facing {@code read_files} tool) is given this
 * type, not the full {@code WorkspaceServiceClient}, so a future edit that tried to add a write call inside it
 * fails to compile instead of just failing a review - see CLAUDE.md's "CodeInsightController must stay
 * read-only structurally" guardrail.
 */
public interface ProjectFileReader {

    FileTreeDto getFileTree(Long projectId);

    FileContentDto getFileContent(Long projectId, String path);
}
