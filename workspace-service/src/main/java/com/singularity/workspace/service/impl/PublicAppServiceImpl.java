package com.singularity.workspace.service.impl;

import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.publish.PublicAppResponse;
import com.singularity.workspace.dto.publish.PublicFileContent;
import com.singularity.workspace.dto.publish.PublicFileNode;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.ProjectMemberId;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.mapper.ProjectMapper;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.repository.PublishedAppRepository;
import com.singularity.workspace.service.PublicAppService;
import com.singularity.workspace.service.impl.PublishedStore.StoredFile;
import com.singularity.workspace.util.ContentTypeUtils;
import com.singularity.workspace.util.ProjectFilePath;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;

/**
 * The public page of a shared app, from the request side.
 *
 * <p>Handles: finding a shared app by its link name, listing its code, reading one file of it (text up to a size, or a
 * note that the file is binary or too large), and forking its sources into a new project.
 *
 * <p>Open to anyone, so nothing here trusts a path or a name. A path goes through {@link ProjectFilePath} before it
 * becomes a storage key, a name that is not a valid link name finds nothing, and every way the app can be unavailable -
 * never published, unpublished, its code not shared, its project deleted - is the same "not found". The snapshot read is
 * the one stored beside the live build, so unpublished edits are never visible.
 *
 * <p>A fork writes the snapshot's files into the new project's own storage with a server-side copy and one metadata row
 * each, as the starter template is written; a copy that fails deletes the fork again rather than leaving a project
 * quietly missing files. The fork is checked against the caller's project allowance like any other new project, and
 * the original's owner is not told.
 */
@Service
@Slf4j
public class PublicAppServiceImpl implements PublicAppService {

    private static final int MAX_FILE_CHARS_BYTES = 512 * 1024;
    private static final int BINARY_SNIFF_BYTES = 8000;
    private static final int MAX_NAME_LENGTH = 255;

    private final PublishedAppRepository appRepository;
    private final ProjectRepository projectRepository;
    private final ProjectMemberRepository projectMemberRepository;
    private final ProjectFileRepository projectFileRepository;
    private final PublishedStore store;
    private final PublishingProperties properties;
    private final ProjectQuota projectQuota;
    private final ProjectMapper projectMapper;
    private final AuthUtil authUtil;
    private final String projectBucket;

    public PublicAppServiceImpl(PublishedAppRepository appRepository, ProjectRepository projectRepository,
                                ProjectMemberRepository projectMemberRepository,
                                ProjectFileRepository projectFileRepository, PublishedStore store,
                                PublishingProperties properties, ProjectQuota projectQuota, ProjectMapper projectMapper,
                                AuthUtil authUtil, @Value("${minio.project-bucket}") String projectBucket) {
        this.appRepository = appRepository;
        this.projectRepository = projectRepository;
        this.projectMemberRepository = projectMemberRepository;
        this.projectFileRepository = projectFileRepository;
        this.store = store;
        this.properties = properties;
        this.projectQuota = projectQuota;
        this.projectMapper = projectMapper;
        this.authUtil = authUtil;
        this.projectBucket = projectBucket;
    }

    private record Shared(PublishedApp app, Project project) {
    }

    @Override
    public PublicAppResponse getApp(String slug) {
        Shared shared = shared(slug);
        return new PublicAppResponse(shared.project().getName(), shared.app().getSlug(),
                properties.urlFor(shared.app().getSlug()), shared.app().getPublishedAt(), listing(shared).size());
    }

    @Override
    public List<PublicFileNode> getFiles(String slug) {
        return listing(shared(slug)).stream()
                .map(file -> new PublicFileNode(file.path(), file.size()))
                .sorted(Comparator.comparing(PublicFileNode::path))
                .toList();
    }

    @Override
    public PublicFileContent getFile(String slug, String path) {
        Shared shared = shared(slug);
        String clean = ProjectFilePath.normalize(path);
        byte[] bytes = store.readSource(shared.app().getSlug(), shared.app().getLivePrefix(), clean, MAX_FILE_CHARS_BYTES)
                .orElseThrow(() -> new ResourceNotFoundException("File", clean));
        if (looksBinary(bytes)) {
            return new PublicFileContent(clean, "", true);
        }
        return new PublicFileContent(clean, new String(bytes, java.nio.charset.StandardCharsets.UTF_8), false);
    }

    @Override
    @Transactional
    public ProjectResponse fork(String slug, ForkProjectRequest request) {
        Long userId = authUtil.getCurrentUserId();
        Shared shared = shared(slug);
        projectQuota.assertCanCreateProject();

        String requested = request == null || request.name() == null ? "" : request.name().strip();
        String name = requested.isEmpty() ? shared.project().getName() + " (fork)" : requested;
        if (name.length() > MAX_NAME_LENGTH) name = name.substring(0, MAX_NAME_LENGTH).strip();

        Project fork = projectRepository.save(Project.builder()
                .name(name)
                .isPublic(false)
                .forkedFromProjectId(shared.project().getId())
                .build());
        projectMemberRepository.save(ProjectMember.builder()
                .id(new ProjectMemberId(fork.getId(), userId))
                .projectRole(ProjectRole.OWNER)
                .acceptedAt(Instant.now())
                .invitedAt(Instant.now())
                .project(fork)
                .build());

        int failed = 0;
        for (StoredFile file : listing(shared)) {
            String path = ProjectFilePath.normalize(file.path());
            String targetKey = ProjectFilePath.objectKey(fork.getId(), path);
            try {
                store.copySourceTo(shared.app().getSlug(), shared.app().getLivePrefix(), path, projectBucket, targetKey);
            } catch (FileStorageException e) {
                log.error("Failed to copy {} while forking the shared app {}", path, slug, e);
                failed++;
                continue;
            }
            projectFileRepository.save(ProjectFile.builder()
                    .project(fork)
                    .path(path)
                    .minioObjectKey(targetKey)
                    .size(file.size())
                    .type(ContentTypeUtils.determineContentType(path))
                    .build());
        }
        if (failed > 0) {
            fork.setDeletedAt(Instant.now());
            projectRepository.save(fork);
            throw new FileStorageException("Couldn't copy " + failed + " file(s) while forking the shared app " + slug, null);
        }

        log.info("User {} forked the shared app {} into project {}", userId, slug, fork.getId());
        return projectMapper.toProjectResponse(fork, ProjectRole.OWNER);
    }

    private List<StoredFile> listing(Shared shared) {
        return store.listSources(shared.app().getSlug(), shared.app().getLivePrefix());
    }

    private Shared shared(String slug) {
        PublishedApp app = slug == null ? null : appRepository.findBySlug(slug.strip().toLowerCase()).orElse(null);
        if (app == null || app.getStatus() != PublishStatus.LIVE || app.getLivePrefix() == null) {
            throw notFound(slug);
        }
        Project project = projectRepository.findById(app.getProjectId()).orElse(null);
        if (project == null || project.getDeletedAt() != null || !Boolean.TRUE.equals(project.getIsPublic())) {
            throw notFound(slug);
        }
        return new Shared(app, project);
    }

    private static ResourceNotFoundException notFound(String slug) {
        return new ResourceNotFoundException("Shared app", slug == null ? "" : slug);
    }

    static boolean looksBinary(byte[] bytes) {
        int limit = Math.min(bytes.length, BINARY_SNIFF_BYTES);
        for (int i = 0; i < limit; i++) {
            if (bytes[i] == 0) return true;
        }
        return false;
    }
}
