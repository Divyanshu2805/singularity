package com.java.vibecraft.controller;

import com.java.vibecraft.dto.code.CodeSearchResponse;
import com.java.vibecraft.dto.project.FileContentResponse;
import com.java.vibecraft.dto.project.FileTreeResponse;
import com.java.vibecraft.service.ProjectFileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;


@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/files")
public class FileController {

    private final ProjectFileService projectFileService;

    @GetMapping
    public ResponseEntity<FileTreeResponse> getFileTree(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectFileService.getFileTree(projectId));
    }

    @GetMapping("/content")
    public ResponseEntity<FileContentResponse> getFile(
            @PathVariable Long projectId,
            @RequestParam String path) {
        return ResponseEntity.ok(projectFileService.getFileContent(projectId, path));
    }

    @GetMapping("/search")
    public ResponseEntity<CodeSearchResponse> searchFiles(
            @PathVariable Long projectId,
            @RequestParam String q) {
        return ResponseEntity.ok(projectFileService.searchFiles(projectId, q));
    }

    @GetMapping("/download-zip")
    public ResponseEntity<byte[]> downloadProjectZip(@PathVariable Long projectId) {
        byte[] zip = projectFileService.buildProjectZip(projectId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("project-" + projectId + ".zip").build().toString())
                .contentType(MediaType.parseMediaType("application/zip"))
                .body(zip);
    }

}
