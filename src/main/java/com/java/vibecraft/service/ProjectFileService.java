package com.java.vibecraft.service;

import com.java.vibecraft.dto.code.CodeSearchResponse;
import com.java.vibecraft.dto.project.FileContentResponse;
import com.java.vibecraft.dto.project.FileTreeResponse;


public interface ProjectFileService {
    FileTreeResponse getFileTree(Long projectId);

    FileContentResponse getFileContent(Long projectId, String path);

    void saveFile(Long projectId, String filePath, String fileContent);

    byte[] buildProjectZip(Long projectId);

    /** Plain-text (not regex) search across every text file in the project, case-insensitive. */
    CodeSearchResponse searchFiles(Long projectId, String query);
}
