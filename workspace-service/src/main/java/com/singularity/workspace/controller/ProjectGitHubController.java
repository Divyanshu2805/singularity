package com.singularity.workspace.controller;

import com.singularity.common.security.DemoAccount;
import com.singularity.workspace.dto.github.GitHubPushRequest;
import com.singularity.workspace.dto.github.ProjectGitHubResponse;
import com.singularity.workspace.service.GitHubService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A project's GitHub repository, for the browser.
 *
 * <p>Handles: reading where the project stands with its repository (any member), pushing the project there - which
 * makes the repository the first time - and forgetting the link (the owner only).
 *
 * <p>A push answers when it is done: it is a handful of calls to GitHub and takes seconds, not a build. Who may call
 * what is the service's to enforce, because the caller is a user there.
 *
 * <p>The shared demo account cannot push (DemoAccount); it never has a connection to push with either.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/github")
public class ProjectGitHubController {

    private final GitHubService gitHubService;
    private final DemoAccount demoAccount;

    @GetMapping
    public ResponseEntity<ProjectGitHubResponse> status(@PathVariable Long projectId) {
        return ResponseEntity.ok(gitHubService.projectStatus(projectId));
    }

    @PostMapping("/push")
    public ResponseEntity<ProjectGitHubResponse> push(@PathVariable Long projectId,
                                                      @RequestBody(required = false) @Valid GitHubPushRequest request) {
        demoAccount.refuseCurrent();
        return ResponseEntity.ok(gitHubService.push(projectId, request));
    }

    @DeleteMapping
    public ResponseEntity<Void> unlink(@PathVariable Long projectId) {
        gitHubService.unlink(projectId);
        return ResponseEntity.noContent().build();
    }
}
