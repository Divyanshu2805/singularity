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


@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/files")
public class FileController {

    private final ProjectFileService projectFileService;

    /**
     * The tree and content reads are guarded here rather than on {@link ProjectFileService}, unlike search and
     * download-zip: {@code InternalWorkspaceController} reads file content through the same service as a trusted
     * machine caller with no user id, so a {@code @security.canViewProject} check on the service would deny every
     * AI-generation file read. {@code #projectId} must match the parameter name exactly, or it silently denies everyone.
     */
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
