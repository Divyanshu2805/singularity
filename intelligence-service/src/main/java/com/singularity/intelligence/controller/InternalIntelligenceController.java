package com.singularity.intelligence.controller;

import com.singularity.intelligence.service.AiGenerationService;
import com.singularity.intelligence.service.DemoProjectService;
import com.singularity.intelligence.service.UserDataService;
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
 * the project was deleted or a member was removed; deleting everything of an account account-service is deleting; and
 * recording the first build of the shared demo account's sample project, which account-service's daily reset asks for.
 *
 * <p>Guarded by the shared internal-service secret rather than a caller's permissions, exactly like
 * InternalWorkspaceController: the caller is workspace-service acting on its own delete/remove, not a user request,
 * so there is no per-request permission of its own to check here. The same holds for account-service deleting an
 * account: it has confirmed the person itself.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalIntelligenceController {

    private final AiGenerationService aiGenerationService;
    private final UserDataService userDataService;
    private final DemoProjectService demoProjectService;

    @PostMapping("/projects/{projectId}/generation/stop")
    public void stopGeneration(@PathVariable Long projectId, @RequestParam(required = false) Long userId) {
        aiGenerationService.stopGenerationsForProject(projectId, userId);
    }

    @PostMapping("/users/{userId}/delete-data")
    public void deleteUserData(@PathVariable Long userId) {
        userDataService.deleteAllFor(userId);
    }

    @PostMapping("/projects/{projectId}/demo-build")
    public void recordDemoBuild(@PathVariable Long projectId, @RequestParam Long userId) {
        demoProjectService.recordFirstBuild(projectId, userId);
    }
}
