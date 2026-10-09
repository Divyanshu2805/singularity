package com.singularity.workspace.controller;

import com.singularity.workspace.dto.publish.PublishLogResponse;
import com.singularity.workspace.dto.publish.PublishRequest;
import com.singularity.workspace.dto.publish.PublishResponse;
import com.singularity.workspace.dto.publish.SharingRequest;
import com.singularity.workspace.service.PublishService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * A project's published app, for the browser.
 *
 * <p>Handles: reading where the publish stands (any member), starting a build that puts the project online or updates
 * what is online, unpublishing, switching whether the code is shared, and reading the output of a failed build (the
 * owner only).
 *
 * <p>Publishing answers 202: the build runs in a runner pod and the client polls the status until it ends. Who may call
 * what is the service's to enforce, because the caller is a user there: every member may read, only the owner may change.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/publish")
public class PublishController {

    private final PublishService publishService;

    @GetMapping
    public ResponseEntity<PublishResponse> getStatus(@PathVariable Long projectId) {
        return ResponseEntity.ok(publishService.getStatus(projectId));
    }

    @PostMapping
    public ResponseEntity<PublishResponse> publish(@PathVariable Long projectId,
                                                   @RequestBody(required = false) @Valid PublishRequest request) {
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(publishService.publish(projectId, request));
    }

    @DeleteMapping
    public ResponseEntity<Void> unpublish(@PathVariable Long projectId) {
        publishService.unpublish(projectId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/sharing")
    public ResponseEntity<PublishResponse> setSharing(@PathVariable Long projectId,
                                                      @RequestBody @Valid SharingRequest request) {
        return ResponseEntity.ok(publishService.setSharing(projectId, request.shared()));
    }

    @GetMapping("/log")
    public ResponseEntity<PublishLogResponse> getBuildLog(@PathVariable Long projectId) {
        return ResponseEntity.ok(publishService.getBuildLog(projectId));
    }
}
