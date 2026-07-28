package com.vibecraft.workspace.controller;

import com.vibecraft.workspace.dto.deploy.PreviewLogsResponse;
import com.vibecraft.workspace.dto.deploy.PreviewResponse;
import com.vibecraft.workspace.service.PreviewDeploymentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * A project's live preview, for the browser.
 *
 * <p>Handles: reading the caller's preview (204 when they have never had one, and polling it counts as a visit that
 * keeps the preview alive), starting one, restarting the dev server in place, stopping it, reading the runner's
 * output, and listing every preview the caller has open across projects.
 *
 * <p>Starting and restarting answer 202: the runner comes up asynchronously, and the client polls until it is
 * running.
 */
@RestController
@RequiredArgsConstructor
public class PreviewController {

    private final PreviewDeploymentService deploymentService;

    @GetMapping("/api/projects/{projectId}/preview")
    public ResponseEntity<PreviewResponse> getPreview(@PathVariable Long projectId) {
        return deploymentService.getPreview(projectId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

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

    @GetMapping("/api/previews")
    public ResponseEntity<List<PreviewResponse>> getMyActivePreviews() {
        return ResponseEntity.ok(deploymentService.getMyActivePreviews());
    }
}
