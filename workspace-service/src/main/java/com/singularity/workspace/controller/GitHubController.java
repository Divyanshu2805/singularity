package com.singularity.workspace.controller;

import com.singularity.workspace.dto.github.GitHubCallbackRequest;
import com.singularity.workspace.dto.github.GitHubConnectResponse;
import com.singularity.workspace.dto.github.GitHubStatusResponse;
import com.singularity.workspace.service.GitHubService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in person's connection to GitHub, for the browser.
 *
 * <p>Handles: reading whether GitHub is connected, starting the sign-in that connects it, finishing that sign-in with
 * what GitHub sent back, and disconnecting.
 *
 * <p>Finishing is a POST made by the app's own page, not a page GitHub sends the browser to. The session cookie is
 * not sent on a navigation that arrives from another site, so an endpoint GitHub redirected to directly would see a
 * signed-out caller; the page at the redirect address reads the two values out of its own address and posts them
 * from inside the site, with the session and the CSRF header like any other change.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/github")
public class GitHubController {

    private final GitHubService gitHubService;

    @GetMapping
    public ResponseEntity<GitHubStatusResponse> status() {
        return ResponseEntity.ok(gitHubService.status());
    }

    @PostMapping("/connect")
    public ResponseEntity<GitHubConnectResponse> connect() {
        return ResponseEntity.ok(gitHubService.startConnect());
    }

    @PostMapping("/callback")
    public ResponseEntity<GitHubStatusResponse> callback(@RequestBody @Valid GitHubCallbackRequest request) {
        return ResponseEntity.ok(gitHubService.completeConnect(request.code(), request.state()));
    }

    @DeleteMapping
    public ResponseEntity<Void> disconnect() {
        gitHubService.disconnect();
        return ResponseEntity.noContent().build();
    }
}
