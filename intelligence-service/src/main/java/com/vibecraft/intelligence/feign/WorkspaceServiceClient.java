package com.vibecraft.intelligence.feign;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectSummaryDto;
import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

import java.util.List;

/**
 * intelligence-service's only way to reach Project/ProjectFile data now that it lives in workspace-service's
 * own database. {@code publishRevision} is write-capable - only {@code AiGenerationServiceImpl}'s
 * {@code finalizeChats} (the trusted build pipeline) is wired to call it, and it publishes a whole turn's file
 * changes as one atomic revision (CODE_REVIEW.md AI-05) rather than one Feign call per file. Everything else that
 * only needs to read a file gets the narrower {@link com.vibecraft.intelligence.service.ProjectFileReader}
 * instead, so the read-only code-insight pipeline can't accidentally gain a write path - see CLAUDE.md's
 * "CodeInsightController must stay read-only structurally" guardrail, now a compile-time guarantee too.
 */
@FeignClient(name = "workspace-service")
public interface WorkspaceServiceClient {

    @GetMapping("/internal/v1/projects/{projectId}/members/{userId}")
    ProjectMembershipDto getMembership(@PathVariable Long projectId, @PathVariable Long userId);

    @GetMapping("/internal/v1/projects/{projectId}")
    ProjectSummaryDto getProjectSummary(@PathVariable Long projectId);

    @GetMapping("/internal/v1/projects")
    List<ProjectSummaryDto> getProjectSummaries(@RequestParam List<Long> ids);

    @GetMapping("/internal/v1/projects/{projectId}/files")
    FileTreeDto getFileTree(@PathVariable Long projectId);

    @GetMapping("/internal/v1/projects/{projectId}/files/content")
    FileContentDto getFileContent(@PathVariable Long projectId, @RequestParam String path);

    @PostMapping("/internal/v1/projects/{projectId}/revisions")
    PublishRevisionResponse publishRevision(@PathVariable Long projectId, @RequestBody PublishRevisionRequest request);

    @GetMapping("/internal/v1/projects/owned-count")
    int getOwnedProjectCount(@RequestParam Long userId);

    @GetMapping("/internal/v1/previews/running-count")
    int getRunningPreviewCount(@RequestParam Long userId);
}
