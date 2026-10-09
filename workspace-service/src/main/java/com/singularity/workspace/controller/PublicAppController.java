package com.singularity.workspace.controller;

import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.publish.PublicAppResponse;
import com.singularity.workspace.dto.publish.PublicFileContent;
import com.singularity.workspace.dto.publish.PublicFileNode;
import com.singularity.workspace.service.PublicAppService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * The public page of a shared app, for anyone with its link.
 *
 * <p>Handles: describing a shared app, listing its code, reading one file, and - for a signed-in caller - forking it.
 *
 * <p>The three reads are the only anonymous endpoints in this service: the filter chain lets a GET on this prefix
 * through without a session and nothing else. The fork is a POST, so it still needs a session and the CSRF header, and
 * a path under this prefix can never reach a project that is not shared.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/public/apps/{slug}")
public class PublicAppController {

    private final PublicAppService publicAppService;

    @GetMapping
    public ResponseEntity<PublicAppResponse> getApp(@PathVariable String slug) {
        return ResponseEntity.ok(publicAppService.getApp(slug));
    }

    @GetMapping("/files")
    public ResponseEntity<List<PublicFileNode>> getFiles(@PathVariable String slug) {
        return ResponseEntity.ok(publicAppService.getFiles(slug));
    }

    @GetMapping("/files/content")
    public ResponseEntity<PublicFileContent> getFile(@PathVariable String slug, @RequestParam String path) {
        return ResponseEntity.ok(publicAppService.getFile(slug, path));
    }

    @PostMapping("/fork")
    public ResponseEntity<ProjectResponse> fork(@PathVariable String slug,
                                                @RequestBody(required = false) @Valid ForkProjectRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(publicAppService.fork(slug, request));
    }
}
