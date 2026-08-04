package com.vibecraft.workspace.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * workspace-service's way to tell intelligence-service a project or membership it was generating against is gone.
 *
 * <p>Handles: stopping the in-flight generation(s) a project delete or member removal just revoked, so the model call
 * doesn't keep running (and spending budget) toward a commit that {@code AiGenerationServiceImpl}'s own recheck would
 * discard anyway. Best-effort from the caller's side - see ProjectServiceImpl.softDelete and
 * ProjectMemberServiceImpl.removeProjectMember, which log and continue rather than fail the delete/removal itself if
 * intelligence-service can't be reached.
 */
@FeignClient(name = "intelligence-service")
public interface IntelligenceServiceClient {

    @PostMapping("/internal/v1/projects/{projectId}/generation/stop")
    void stopGeneration(@PathVariable Long projectId, @RequestParam(required = false) Long userId);
}
