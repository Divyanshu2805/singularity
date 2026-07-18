package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.dto.project.ProjectNameRequest;
import com.vibecraft.intelligence.dto.project.ProjectNameResponse;
import com.vibecraft.intelligence.llm.ProjectNameGenerator;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * intelligence-service's API for the other services, not the browser - same shape and guard as account-
 * service's/workspace-service's own internal controllers. Not yet called by anything: workspace-service's
 * ProjectServiceImpl.createProjectFromPrompt still uses its own dependency-free heuristic
 * (util.ProjectNameHeuristic) rather than calling out here - wiring that up is a real product decision
 * (AI-quality name vs. latency/cost), explicitly out of scope for this extraction. Built now so that decision
 * doesn't block on writing this endpoint later.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalIntelligenceController {

    private final ProjectNameGenerator projectNameGenerator;

    @PostMapping("/project-names")
    public ProjectNameResponse generateName(@RequestBody ProjectNameRequest request) {
        return new ProjectNameResponse(projectNameGenerator.generateName(request.prompt(), request.userId()));
    }
}
