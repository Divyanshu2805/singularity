package com.vibecraft.workspace.controller;

import com.vibecraft.workspace.dto.code.CodeSearchResponse;
import com.vibecraft.workspace.dto.project.FileContentResponse;
import com.vibecraft.workspace.dto.project.FileTreeResponse;
import com.vibecraft.workspace.service.ProjectFileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * A project's files, for the browser.
 *
 * <p>Handles: the file tree, one file's content, plain-text search across the project, and a ZIP of the whole thing.
 *
 * <p>The tree and content reads are guarded here rather than on the service, unlike search and download: the internal
 * API reads file content through the same service as a machine caller with no user id, so a caller-based check on the
 * service would deny every AI-generation file read. The SpEL argument name must match the method's parameter name
 * exactly, or the guard evaluates to null and silently denies everyone.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/files")
public class FileController {

    private final ProjectFileService projectFileService;

    @GetMapping
    @PreAuthorize("@security.canViewProject(#projectId)")
    public ResponseEntity<FileTreeResponse> getFileTree(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectFileService.getFileTree(projectId));
    }

    @GetMapping("/content")
    @PreAuthorize("@security.canViewProject(#projectId)")
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
