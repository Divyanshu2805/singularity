package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.project.CreateProjectFromPromptRequest;
import com.java.vibecraft.dto.project.ProjectRequest;
import com.java.vibecraft.llm.ProjectNameGenerator;
import com.java.vibecraft.dto.project.ProjectResponse;
import com.java.vibecraft.dto.project.ProjectSummaryResponse;
import com.java.vibecraft.entity.Project;
import com.java.vibecraft.entity.ProjectMember;
import com.java.vibecraft.entity.ProjectMemberId;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.enums.ProjectRole;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.mapper.ProjectMapper;
import com.java.vibecraft.repository.ProjectMemberRepository;
import com.java.vibecraft.repository.ProjectRepository;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.ProjectService;
import com.java.vibecraft.service.ProjectTemplateService;
import com.java.vibecraft.service.SubscriptionService;
import com.java.vibecraft.service.TemplateInitResult;
import jakarta.transaction.Transactional;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
@Transactional
@Slf4j
public class ProjectServiceImpl implements ProjectService {

    ProjectRepository projectRepository;
    UserRepository userRepository;
    ProjectMapper projectMapper;
    ProjectMemberRepository projectMemberRepository;
    AuthUtil authUtil;
    SubscriptionService subscriptionService;
    ProjectTemplateService projectTemplateService;
    ProjectNameGenerator projectNameGenerator;

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public ProjectResponse getUserProjectById(Long id) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    @Override
    public ProjectResponse createProject(ProjectRequest request) {
        assertCanCreateProject();
        return createOwnedProject(request.name());
    }

    @Override
    public ProjectResponse createProjectFromPrompt(CreateProjectFromPromptRequest request) {
        // Checked before naming, so a user at their plan limit doesn't spend an AI call first.
        assertCanCreateProject();
        return createOwnedProject(projectNameGenerator.generateName(request.prompt()));
    }

    private void assertCanCreateProject() {
        if(!subscriptionService.canCreateNewProject()) {
            throw new BadRequestException("User cannot create a New project with current Plan, Upgrade plan now.");
        }
    }

    private ProjectResponse createOwnedProject(String name) {
        Long userId = authUtil.getCurrentUserId();
        User owner = userRepository.getReferenceById(userId);

        Project project = Project.builder()
                .name(name)
                .isPublic(false)
                .build();

        project = projectRepository.save(project);

        ProjectMemberId projectMemberId = new ProjectMemberId(project.getId(), owner.getId());

        ProjectMember projectMember = ProjectMember.builder()
                .id(projectMemberId)
                .projectRole(ProjectRole.OWNER)
                .user(owner)
                .acceptedAt(Instant.now())
                .invitedAt(Instant.now())
                .project(project)
                .build();

        projectMemberRepository.save(projectMember);

        TemplateInitResult templateResult;
        try {
            templateResult = projectTemplateService.initializeProjectFromTemplate(project.getId());
        } catch (Exception e) {
            log.error("Unexpected error during template initialization for project {}", project.getId(), e);
            templateResult = new TemplateInitResult(0, 0, List.of("(template initialization failed unexpectedly)"));
        }

        if (!templateResult.isComplete()) {
            project.setTemplateInitIssue(describeIncompleteTemplate(templateResult));
            project = projectRepository.save(project);
        }

        return projectMapper.toProjectResponse(project, ProjectRole.OWNER);
    }

    @Override
    public List<ProjectSummaryResponse> getUserProjects() {

        Long userId = authUtil.getCurrentUserId();
        var projects = projectRepository.findAllAccessibleByUser(userId);

        Map<Long, ProjectMember> membershipsByProjectId = projectMemberRepository.findByIdUserId(userId).stream()
                .collect(Collectors.toMap(pm -> pm.getId().getProjectId(), Function.identity()));

        return projects.stream()
                .map(project -> {
                    ProjectMember membership = membershipsByProjectId.get(project.getId());
                    return projectMapper.toProjectSummaryResponse(project, membership.getProjectRole(),
                            membership.getPinnedAt(), membership.getStarredAt());
                })
                .toList();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public void setPinned(Long id, boolean pinned) {
        ProjectMember membership = getCurrentUserMembership(id);
        // Re-pinning keeps the original time, so the sidebar's order doesn't shuffle.
        if (pinned == (membership.getPinnedAt() != null)) {
            return;
        }
        membership.setPinnedAt(pinned ? Instant.now() : null);
        projectMemberRepository.save(membership);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public void setStarred(Long id, boolean starred) {
        ProjectMember membership = getCurrentUserMembership(id);
        if (starred == (membership.getStarredAt() != null)) {
            return;
        }
        membership.setStarredAt(starred ? Instant.now() : null);
        projectMemberRepository.save(membership);
    }

    private ProjectMember getCurrentUserMembership(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        getAccessibleProjectById(projectId, userId); // excludes soft-deleted projects
        return projectMemberRepository.findById(new ProjectMemberId(projectId, userId))
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", projectId + "/" + userId));
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse updateProject(Long id, ProjectRequest request) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        project.setName(request.name());

        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    @Override
    @PreAuthorize("@security.canDeleteProject(#id)")
    public void softDelete(Long id) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        project.setDeletedAt(Instant.now());

        projectRepository.save(project);
    }

    public Project getAccessibleProjectById(Long projectId, Long userId) {

        return projectRepository.findAccessibleProjectById(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse retryTemplateInitialization(Long id) {
        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        TemplateInitResult result = projectTemplateService.initializeProjectFromTemplate(id);

        project.setTemplateInitIssue(result.isComplete() ? null : describeIncompleteTemplate(result));
        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project, getRole(id, userId));
    }

    private ProjectRole getRole(Long projectId, Long userId) {
        return projectMemberRepository.findRoleByProjectIdAndUserId(projectId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("ProjectMember", projectId + "/" + userId));
    }

    private String describeIncompleteTemplate(TemplateInitResult result) {
        if (result.copiedCount() == 0 && result.skippedCount() == 0) {
            return "Template initialization failed: the starter template storage was unreachable, " +
                    "so no files could be created.";
        }
        return "Template initialization incomplete: " + result.failedPaths().size()
                + " file(s) could not be created (" + String.join(", ", result.failedPaths()) + ").";
    }
}
