package com.java.vibecraft.service.impl;

import com.java.vibecraft.entity.Project;
import com.java.vibecraft.entity.ProjectFile;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.repository.ProjectFileRepository;
import com.java.vibecraft.repository.ProjectRepository;
import com.java.vibecraft.service.ProjectTemplateService;
import com.java.vibecraft.service.TemplateInitResult;
import com.java.vibecraft.util.ContentTypeUtils;
import io.minio.*;
import io.minio.messages.Item;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
@Slf4j
public class ProjectTemplateServiceImpl implements ProjectTemplateService {

    private final MinioClient minioClient;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectRepository projectRepository;

    private static final String TEMPLATE_BUCKET = "starter-projects";
    private static final String TARGET_BUCKET = "projects";
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

                String destKey = projectId + "/" + cleanPath;

                minioClient.copyObject(
                        CopyObjectArgs.builder()
                                .bucket(TARGET_BUCKET)
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
                        .path(cleanPath)
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
