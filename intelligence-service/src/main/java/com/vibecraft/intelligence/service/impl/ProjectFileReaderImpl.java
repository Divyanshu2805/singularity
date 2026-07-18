package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.service.ProjectFileReader;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

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
