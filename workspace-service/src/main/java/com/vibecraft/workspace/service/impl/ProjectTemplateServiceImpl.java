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
import lombok.RequiredArgsConstructor;
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
 * later. Both the source and destination buckets come from configuration rather than being hard-coded, so template
 * files land in the same bucket every other write uses.
 */
@RequiredArgsConstructor
@Service
@Slf4j
public class ProjectTemplateServiceImpl implements ProjectTemplateService {

    private final MinioClient minioClient;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectRepository projectRepository;

    @Value("${minio.project-bucket}")
    private String projectBucket;

    private static final String TEMPLATE_BUCKET = "starter-projects";

    private static final String TEMPLATE_NAME = "react-vite-tailwind-daisyui-starter";

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
                            .bucket(TEMPLATE_BUCKET)
                            .prefix(TEMPLATE_NAME + "/")
                            .recursive(true)
                            .build()
            );
        } catch (Exception e) {
            log.error("Failed to list template '{}' files for project {}", TEMPLATE_NAME, projectId, e);
            return new TemplateInitResult(0, existingPaths.size(), List.of("(unable to list template files)"));
        }

        int copied = 0;
        List<String> failedPaths = new ArrayList<>();

        for (Result<Item> result : results) {
            String cleanPath = null;
            try {
                Item item = result.get();
                String sourceKey = item.objectName();
                cleanPath = sourceKey.replaceFirst(TEMPLATE_NAME + "/", "");

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
                                                .bucket(TEMPLATE_BUCKET)
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
