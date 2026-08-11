package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.ProjectTemplateService;
import com.vibecraft.workspace.service.TemplateInitResult;
import com.vibecraft.workspace.util.ContentTypeUtils;
import com.vibecraft.workspace.util.ProjectFilePath;
import io.minio.*;
import io.minio.messages.Item;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Copies the starter template's files into a new project.
 *
 * <p>Handles: listing the template's objects, copying each one that the project does not already have inside storage,
 * recording its metadata, and retrying the whole pass a few times while anything is still missing. It never throws
 * for a partial failure - the result says what is missing so the caller can surface it.
 *
 * <p>Skipping files the project already has is what makes a retry safe, including the user-triggered retry much
 * later. The source and destination buckets, and the template's own name, all come from configuration rather than
 * being hard-coded, so template files land in the same bucket every other write uses and pointing at a different
 * starter never needs a code change.
 *
 * <p>A listing that comes back with zero objects at all - the template bucket or name misconfigured, or genuinely
 * empty - is treated as a failed attempt, not a vacuously complete one: an empty result and no explicit failure look
 * identical to a plain empty-list check, and previously produced a "successfully initialized" project with no files
 * and no error, silently.
 */
@Service
@Slf4j
public class ProjectTemplateServiceImpl implements ProjectTemplateService {

    private final MinioClient minioClient;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectRepository projectRepository;
    private final String projectBucket;
    private final String templateBucket;
    private final String templateName;

    public ProjectTemplateServiceImpl(MinioClient minioClient, ProjectFileRepository projectFileRepository,
                                       ProjectRepository projectRepository,
                                       @Value("${minio.project-bucket}") String projectBucket,
                                       @Value("${minio.template-bucket}") String templateBucket,
                                       @Value("${minio.template-name}") String templateName) {
        this.minioClient = minioClient;
        this.projectFileRepository = projectFileRepository;
        this.projectRepository = projectRepository;
        this.projectBucket = projectBucket;
        this.templateBucket = templateBucket;
        this.templateName = templateName;
    }

    private static final int MAX_ATTEMPTS = 3;
    private static final Duration RETRY_DELAY = Duration.ofSeconds(1);

    @Override
    public TemplateInitResult initializeProjectFromTemplate(Long projectId) {
        TemplateInitResult result = attemptOnce(projectId);

        for (int attempt = 2; attempt <= MAX_ATTEMPTS && !result.isComplete(); attempt++) {
            log.warn("Template initialization for project {} incomplete after attempt {} ({} file(s) still " +
                    "missing); retrying...", projectId, attempt - 1, result.failedPaths().size());
            sleep(RETRY_DELAY);
            result = attemptOnce(projectId);
        }

        if (result.isComplete()) {
            log.info("Template initialization for project {} complete: {} copied, {} already present",
                    projectId, result.copiedCount(), result.skippedCount());
        } else {
            log.error("Template initialization for project {} still incomplete after {} attempt(s): {}",
                    projectId, MAX_ATTEMPTS, result.failedPaths());
        }

        return result;
    }

    private TemplateInitResult attemptOnce(Long projectId) {
        Project project = projectRepository.findById(projectId).orElseThrow(
                () -> new ResourceNotFoundException("Project", projectId.toString()));

        Set<String> existingPaths = projectFileRepository.findByProjectId(projectId).stream()
                .map(ProjectFile::getPath)
                .collect(Collectors.toSet());

        Iterable<Result<Item>> results;
        try {
            results = minioClient.listObjects(
                    ListObjectsArgs.builder()
                            .bucket(templateBucket)
                            .prefix(templateName + "/")
                            .recursive(true)
                            .build()
            );
        } catch (Exception e) {
            log.error("Failed to list template '{}' files for project {}", templateName, projectId, e);
            return new TemplateInitResult(0, existingPaths.size(), List.of("(unable to list template files)"));
        }

        int itemsSeen = 0;
        int copied = 0;
        List<String> failedPaths = new ArrayList<>();

        for (Result<Item> result : results) {
            itemsSeen++;
            String cleanPath = null;
            try {
                Item item = result.get();
                String sourceKey = item.objectName();
                cleanPath = sourceKey.replaceFirst(templateName + "/", "");

                if (existingPaths.contains(cleanPath)) {
                    continue;
                }

                String destKey = ProjectFilePath.objectKey(projectId, cleanPath);

                minioClient.copyObject(
                        CopyObjectArgs.builder()
                                .bucket(projectBucket)
                                .object(destKey)
                                .source(
                                        CopySource.builder()
                                                .bucket(templateBucket)
                                                .object(sourceKey)
                                                .build()
                                )
                                .build()
                );

                projectFileRepository.save(ProjectFile.builder()
                        .project(project)
                        .path(ProjectFilePath.normalize(cleanPath))
                        .minioObjectKey(destKey)
                        .size(item.size())
                        .type(ContentTypeUtils.determineContentType(cleanPath))
                        .build());

                copied++;
            } catch (Exception e) {
                log.error("Failed to initialize template file '{}' for project {}", cleanPath, projectId, e);
                failedPaths.add(cleanPath != null ? cleanPath : "(unknown file)");
            }
        }

        if (itemsSeen == 0) {
            log.error("Template '{}' in bucket '{}' returned no files at all for project {} - it appears empty " +
                    "or misconfigured.", templateName, templateBucket, projectId);
            failedPaths.add("(the starter template has no files - it may be empty or misconfigured)");
        }

        return new TemplateInitResult(copied, existingPaths.size(), failedPaths);
    }

    private void sleep(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
