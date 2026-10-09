package com.singularity.workspace.controller;

import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.dto.revision.RevisionPreviewResponse;
import com.singularity.workspace.dto.revision.RevisionSummaryResponse;
import com.singularity.workspace.service.RevisionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * A project's revision history, for the browser (CODE_REVIEW.md AI-05 / CODE_TODO.md GATE-02).
 *
 * <p>Handles: listing revisions, previewing what restoring to one would change, and restoring - each to the revision
 * itself or, with {@code before=true}, to the project as it stood just before it, which is the chat's Undo. The
 * workspace's History panel and the Undo on a saved turn are what call it.
 *
 * <p>The path sits under {@code /api/projects/**} so the Gateway's workspace route owns it - it was briefly
 * {@code /api/v1/...}, which no Gateway route matches, so every call 404'd before reaching this service. The
 * {@code @PreAuthorize} guards only prove access to {@code projectId}; that the revision belongs to that project is
 * enforced in {@code RevisionServiceImpl}, not here.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/revisions")
public class ProjectRevisionController {

    private final RevisionService revisionService;
    private final AuthUtil authUtil;

    @GetMapping
    @PreAuthorize("@security.canViewProject(#projectId)")
    public ResponseEntity<List<RevisionSummaryResponse>> list(@PathVariable Long projectId) {
        return ResponseEntity.ok(revisionService.listRevisions(projectId));
    }

    @GetMapping("/{revisionId}/preview")
    @PreAuthorize("@security.canViewProject(#projectId)")
    public ResponseEntity<RevisionPreviewResponse> preview(@PathVariable Long projectId, @PathVariable Long revisionId,
                                                           @RequestParam(defaultValue = "false") boolean before) {
        return ResponseEntity.ok(revisionService.preview(projectId, revisionId, before));
    }

    @PostMapping("/{revisionId}/restore")
    @PreAuthorize("@security.canEditProject(#projectId)")
    public ResponseEntity<PublishRevisionResponse> restore(@PathVariable Long projectId, @PathVariable Long revisionId,
                                                           @RequestParam(defaultValue = "false") boolean before) {
        return ResponseEntity.ok(revisionService.restore(projectId, revisionId, before, authUtil.getCurrentUserId()));
    }
}
