package com.singularity.workspace.controller;

import com.singularity.workspace.dto.member.InviteMemberRequest;
import com.singularity.workspace.dto.member.MemberResponse;
import com.singularity.workspace.dto.member.UpdateMemberRoleRequest;
import com.singularity.workspace.service.ProjectMemberService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * A project's collaborators, for the browser.
 *
 * <p>Handles: listing members, inviting an email address, accepting or declining an invitation addressed to the
 * caller, the owner withdrawing an invitation, changing a member's role and removing them. The caller's own
 * invitations across every project are listed by ProjectController, since that list belongs to no one project.
 */
@RestController
@RequestMapping("/api/projects/{projectId}/members")
@RequiredArgsConstructor
public class ProjectMemberController {

    private final ProjectMemberService projectMemberService;

    @GetMapping
    public ResponseEntity<List<MemberResponse>> getProjectMembers(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectMemberService.getProjectMembers(projectId));
    }

    @PostMapping
    public ResponseEntity<MemberResponse> inviteMember(
            @PathVariable Long projectId,
            @RequestBody @Valid InviteMemberRequest request
    ) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                projectMemberService.inviteMember(projectId, request)
        );
    }

    @PostMapping("/accept")
    public ResponseEntity<MemberResponse> acceptInvite(@PathVariable Long projectId) {
        return ResponseEntity.ok(projectMemberService.acceptInvite(projectId));
    }

    @PostMapping("/decline")
    public ResponseEntity<Void> declineInvite(@PathVariable Long projectId) {
        projectMemberService.declineInvite(projectId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/invites/{inviteId}")
    public ResponseEntity<Void> withdrawInvite(
            @PathVariable Long projectId,
            @PathVariable Long inviteId
    ) {
        projectMemberService.withdrawInvite(projectId, inviteId);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{memberId}")
    public ResponseEntity<MemberResponse> updateMemberRole(
            @PathVariable Long projectId,
            @PathVariable Long memberId,
            @RequestBody @Valid UpdateMemberRoleRequest request
    ) {
        return ResponseEntity.ok(projectMemberService.updateMemberRole(projectId, memberId, request));
    }

    @DeleteMapping("/{memberId}")
    public ResponseEntity<Void> removeMember(
            @PathVariable Long projectId,
            @PathVariable Long memberId
    ) {
        projectMemberService.removeProjectMember(projectId, memberId);
        return ResponseEntity.noContent().build();
    }

}
