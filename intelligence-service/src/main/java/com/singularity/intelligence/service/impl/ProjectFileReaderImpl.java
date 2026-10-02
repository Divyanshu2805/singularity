package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileContentDto;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.service.ProjectFileReader;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * The read-only file reader, backed by workspace-service's internal API.
 *
 * <p>Handles: the file tree and one file's content, by delegating to the workspace client - and exposing nothing
 * else, which is the whole point of the narrower type.
 */
@Service
@RequiredArgsConstructor
public class ProjectFileReaderImpl implements ProjectFileReader {

    private final WorkspaceServiceClient workspaceServiceClient;

    @Override
    public FileTreeDto getFileTree(Long projectId) {
        return workspaceServiceClient.getFileTree(projectId);
    }

    @Override
    public FileContentDto getFileContent(Long projectId, String path) {
        return workspaceServiceClient.getFileContent(projectId, path);
    }
}
