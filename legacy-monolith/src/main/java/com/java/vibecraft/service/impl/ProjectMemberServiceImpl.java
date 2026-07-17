package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.member.InviteMemberRequest;
import com.java.vibecraft.dto.member.MemberResponse;
import com.java.vibecraft.dto.member.UpdateMemberRoleRequest;
import com.java.vibecraft.entity.Project;
import com.java.vibecraft.entity.ProjectMember;
import com.java.vibecraft.entity.ProjectMemberId;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.error.ForbiddenException;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.mapper.ProjectMemberMapper;
import com.java.vibecraft.repository.ProjectMemberRepository;
import com.java.vibecraft.repository.ProjectRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.ProjectMemberService;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@RequiredArgsConstructor
@Transactional
public class ProjectMemberServiceImpl implements ProjectMemberService {

    ProjectMemberRepository projectMemberRepository;
    UserRepository userRepository;
    ProjectRepository projectRepository;
    ProjectMemberMapper projectMemberMapper;
    AuthUtil authUtil;

    @Override
    @PreAuthorize("@security.canViewMembers(#projectId)")
    public List<MemberResponse> getProjectMembers(Long projectId) {

        return projectMemberRepository.findByIdProjectId(projectId)
                .stream()
                .map(projectMemberMapper::toProjectMemberResponseFromMember)
                .toList();
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public MemberResponse inviteMember(Long projectId, InviteMemberRequest request) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(projectId, userId);

        User invitee = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ResourceNotFoundException("User", request.username()));

        if(invitee.getId().equals(userId)) {
            throw new ForbiddenException("Cannot invite yourself");
        }

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, invitee.getId());

        if(projectMemberRepository.existsById(projectMemberId)) {
            throw new ForbiddenException("Cannot invite once again");
        }

        ProjectMember member = ProjectMember.builder()
                .id(projectMemberId)
                .project(project)
                .user(invitee)
                .projectRole(request.role())
                .invitedAt(Instant.now())
                .build();

        projectMemberRepository.save(member);

        return projectMemberMapper.toProjectMemberResponseFromMember(member);
    }

    @Override
    public MemberResponse acceptInvite(Long projectId) {

        Long userId = authUtil.getCurrentUserId();
        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, userId);

        ProjectMember projectMember = projectMemberRepository.findById(projectMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", userId.toString()));

        if (projectMember.getAcceptedAt() == null) {
            projectMember.setAcceptedAt(Instant.now());
            projectMemberRepository.save(projectMember);
        }

        return projectMemberMapper.toProjectMemberResponseFromMember(projectMember);
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public MemberResponse updateMemberRole(Long projectId, Long memberId, UpdateMemberRoleRequest request) {

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, memberId);
        ProjectMember projectMember = projectMemberRepository.findById(projectMemberId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", memberId.toString()));

        projectMember.setProjectRole(request.role());

        projectMemberRepository.save(projectMember);

        return projectMemberMapper.toProjectMemberResponseFromMember(projectMember);
    }

    @Override
    @PreAuthorize("@security.canManageMembers(#projectId)")
    public void removeProjectMember(Long projectId, Long memberId) {

        ProjectMemberId projectMemberId = new ProjectMemberId(projectId, memberId);
        if(!projectMemberRepository.existsById(projectMemberId)) {
            throw new ResourceNotFoundException("ProjectMember", memberId.toString());
        }

        projectMemberRepository.deleteById(projectMemberId);
    }

    public Project getAccessibleProjectById(Long projectId, Long userId) {

        return projectRepository.findAccessibleProjectById(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }
}
