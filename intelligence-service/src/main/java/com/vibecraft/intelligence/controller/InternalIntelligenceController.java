package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.service.AiGenerationService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * intelligence-service's API for the other services, not the browser.
 *
 * <p>Handles: stopping in-flight generation(s) that workspace-service reports have lost their authorization, because
 * the project was deleted or a member was removed.
 *
 * <p>Guarded by the shared internal-service secret rather than a caller's permissions, exactly like
 * InternalWorkspaceController: the caller is workspace-service acting on its own delete/remove, not a user request,
 * so there is no per-request permission of its own to check here.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalIntelligenceController {

    private final AiGenerationService aiGenerationService;

    @PostMapping("/projects/{projectId}/generation/stop")
    public void stopGeneration(@PathVariable Long projectId, @RequestParam(required = false) Long userId) {
        aiGenerationService.stopGenerationsForProject(projectId, userId);
    }
}
