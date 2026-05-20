package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.project.ProjectRequest;
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

    @Override
    @PreAuthorize("@security.canViewProject(#id)")
    public ProjectResponse getUserProjectById(Long id) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        return projectMapper.toProjectResponse(project);
    }

    @Override
    public ProjectResponse createProject(ProjectRequest request) {

        if(!subscriptionService.canCreateNewProject()) {
            throw new BadRequestException("User cannot create a New project with current Plan, Upgrade plan now.");
        }

        Long userId = authUtil.getCurrentUserId();
        User owner = userRepository.getReferenceById(userId);

        Project project = Project.builder()
                .name(request.name())
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

        return projectMapper.toProjectResponse(project);
    }

    @Override
    public List<ProjectSummaryResponse> getUserProjects() {

        Long userId = authUtil.getCurrentUserId();
        var projects = projectRepository.findAllAccessibleByUser(userId);

        return projectMapper.toListOfProjectSummaryResponse(projects);
    }

    @Override
    @PreAuthorize("@security.canEditProject(#id)")
    public ProjectResponse updateProject(Long id, ProjectRequest request) {

        Long userId = authUtil.getCurrentUserId();
        Project project = getAccessibleProjectById(id, userId);

        project.setName(request.name());

        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project);
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
        Project project = getAccessibleProjectById(id, authUtil.getCurrentUserId());

        TemplateInitResult result = projectTemplateService.initializeProjectFromTemplate(id);

        project.setTemplateInitIssue(result.isComplete() ? null : describeIncompleteTemplate(result));
        project = projectRepository.save(project);

        return projectMapper.toProjectResponse(project);
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
