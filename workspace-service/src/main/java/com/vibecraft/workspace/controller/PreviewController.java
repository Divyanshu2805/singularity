package com.vibecraft.workspace.controller;

import com.vibecraft.workspace.dto.deploy.PreviewLogsResponse;
import com.vibecraft.workspace.dto.deploy.PreviewResponse;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class PreviewController {

    private final PreviewDeploymentService deploymentService;

    /** The project's latest preview in any state; 204 when it has never had one. Polling it keeps a preview alive. */
    @GetMapping("/api/projects/{projectId}/preview")
    public ResponseEntity<PreviewResponse> getPreview(@PathVariable Long projectId) {
        return deploymentService.getPreview(projectId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /**
     * Starts the preview (202 - it comes up asynchronously), or returns the one already running. {@code /deploy} is
     * the original name of this endpoint, kept as an alias.
     */
    @PostMapping({"/api/projects/{projectId}/preview", "/api/projects/{projectId}/deploy"})
    public ResponseEntity<PreviewResponse> startPreview(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(deploymentService.startPreview(projectId));
    }

    @PostMapping("/api/projects/{projectId}/preview/restart")
    public ResponseEntity<PreviewResponse> restartPreview(@PathVariable Long projectId) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(deploymentService.restartPreview(projectId));
    }

    @DeleteMapping("/api/projects/{projectId}/preview")
    public ResponseEntity<Void> stopPreview(@PathVariable Long projectId) {
        deploymentService.stopPreview(projectId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/api/projects/{projectId}/preview/logs")
    public ResponseEntity<PreviewLogsResponse> getPreviewLogs(@PathVariable Long projectId) {
        return ResponseEntity.ok(deploymentService.getPreviewLogs(projectId));
    }

    /** The caller's own starting or running previews, across all projects. */
    @GetMapping("/api/previews")
    public ResponseEntity<List<PreviewResponse>> getMyActivePreviews() {
        return ResponseEntity.ok(deploymentService.getMyActivePreviews());
    }
}
