package com.vibecraft.workspace.controller;

import com.vibecraft.workspace.dto.project.ForkProjectRequest;
import com.vibecraft.workspace.dto.project.CreateProjectFromPromptRequest;
import com.vibecraft.workspace.dto.project.ProjectRequest;
import com.vibecraft.workspace.dto.project.ProjectResponse;
import com.vibecraft.workspace.dto.project.ProjectSummaryResponse;
import com.vibecraft.workspace.service.ProjectService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/projects")
@RequiredArgsConstructor
public class ProjectController {

    private final ProjectService projectService;

    @GetMapping
    public ResponseEntity<List<ProjectSummaryResponse>> getMyProjects() {
        return ResponseEntity.ok(projectService.getUserProjects());
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

    /** For the owner, deletes the project for everyone; for an editor, removes it from their own projects only. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProject(@PathVariable Long id) {
        projectService.softDelete(id);
        return ResponseEntity.noContent().build();
    }

    /** Copies a project the caller can edit into a new one they own. The body (a name) is optional. */
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

















