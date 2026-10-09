package com.singularity.workspace.controller;

import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.workspace.dto.project.CreateProjectFromPromptRequest;
import com.singularity.workspace.dto.project.ProjectRequest;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.project.ProjectSummaryResponse;
import com.singularity.workspace.dto.member.InvitationResponse;
import com.singularity.workspace.service.ProjectMemberService;
import com.singularity.workspace.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Projects, for the browser.
 *
 * <p>Handles: listing the caller's projects, reading one, creating a project by name or from a typed description,
 * renaming, deleting, forking, retrying a failed starter-template initialisation, and the per-member pin and star
 * flags.
 *
 * <p>Also lists the invitations addressed to the caller, across every project: that list belongs to no one project,
 * so it lives here and not under a project's members.
 *
 * <p>Deleting means different things to different people: the owner deletes the project for everyone, anyone else
 * only removes it from their own list.
 */
@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;
    private final ProjectMemberService projectMemberService;

    @GetMapping
    public ResponseEntity<List<ProjectSummaryResponse>> getMyProjects() {
        return ResponseEntity.ok(projectService.getUserProjects());
    }

    @GetMapping("/invitations")
    public ResponseEntity<List<InvitationResponse>> getMyInvitations() {
        return ResponseEntity.ok(projectMemberService.getMyInvitations());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProjectResponse> getProjectById(@PathVariable Long id) {
        return ResponseEntity.ok(projectService.getUserProjectById(id));
    }

    @PostMapping
    public ResponseEntity<ProjectResponse> createProject(@RequestBody @Valid ProjectRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.createProject(request));
    }

    @PostMapping("/from-prompt")
    public ResponseEntity<ProjectResponse> createProjectFromPrompt(@RequestBody @Valid CreateProjectFromPromptRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.createProjectFromPrompt(request));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ProjectResponse> updateProject(@PathVariable Long id, @RequestBody @Valid ProjectRequest request) {
        return ResponseEntity.ok(projectService.updateProject(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProject(@PathVariable Long id) {
        projectService.softDelete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/fork")
    public ResponseEntity<ProjectResponse> forkProject(@PathVariable Long id,
                                                       @RequestBody(required = false) @Valid ForkProjectRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(projectService.forkProject(id, request));
    }

    @PostMapping("/{id}/retry-template-init")
    public ResponseEntity<ProjectResponse> retryTemplateInit(@PathVariable Long id) {
        return ResponseEntity.ok(projectService.retryTemplateInitialization(id));
    }

    @PutMapping("/{id}/pin")
    public ResponseEntity<Void> pinProject(@PathVariable Long id) {
        projectService.setPinned(id, true);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/pin")
    public ResponseEntity<Void> unpinProject(@PathVariable Long id) {
        projectService.setPinned(id, false);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/star")
    public ResponseEntity<Void> starProject(@PathVariable Long id) {
        projectService.setStarred(id, true);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}/star")
    public ResponseEntity<Void> unstarProject(@PathVariable Long id) {
        projectService.setStarred(id, false);
        return ResponseEntity.noContent().build();
    }

}

