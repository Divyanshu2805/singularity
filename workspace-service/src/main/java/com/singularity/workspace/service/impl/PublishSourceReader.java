package com.singularity.workspace.service.impl;

import com.singularity.common.error.ConflictException;
import com.singularity.common.error.FileStorageException;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.util.ProjectFilePath;
import com.singularity.workspace.util.TarArchive.TooLargeException;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Reads a project's files as they stood at one revision, for a build.
 *
 * <p>Handles: taking the project's current revision, reading every file, and reading the revision again - the files
 * are the revision's only if it did not move in between, and a read that raced a publish is done again, up to three
 * times, rather than building from a mixture of two revisions. Files under {@code node_modules}, {@code .git} or a
 * previous {@code dist} are left out, and the whole read is bounded by the file count and the total size.
 *
 * <p>Reads the live layout, not the revision's manifest, because a revision is a delta chain that does not hold a file
 * nothing has changed since the project was created - the starter template's files among them - so a snapshot rebuilt
 * from it alone would be missing most of the app. The live layout always matches the current revision, which is what
 * the second read of the revision proves.
 *
 * <p>{@link #forSharing} drops environment files from a set of sources before they are stored for the share page: a
 * {@code .env} is the one file that is likely to hold something its author did not mean anyone to see.
 */
@Component
@Slf4j
public class PublishSourceReader {

    private static final int ATTEMPTS = 3;

    public record Captured(Long revisionId, Map<String, byte[]> files, long totalBytes) {
    }

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final MinioClient minioClient;
    private final PublishingProperties properties;
    private final String projectBucket;

    public PublishSourceReader(ProjectRepository projectRepository, ProjectFileRepository projectFileRepository,
                               MinioClient minioClient, PublishingProperties properties,
                               @Value("${minio.project-bucket}") String projectBucket) {
        this.projectRepository = projectRepository;
        this.projectFileRepository = projectFileRepository;
        this.minioClient = minioClient;
        this.properties = properties;
        this.projectBucket = projectBucket;
    }

    public Captured capture(Long projectId) {
        for (int attempt = 1; attempt <= ATTEMPTS; attempt++) {
            Long before = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
            Map<String, byte[]> files = readAll(projectId);
            Long after = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
            if (Objects.equals(before, after)) {
                long total = files.values().stream().mapToLong(bytes -> bytes.length).sum();
                return new Captured(before, files, total);
            }
            log.info("Project {} moved to another revision while its files were being read for a publish (attempt {})",
                    projectId, attempt);
        }
        throw new ConflictException("The project kept changing while the publish was reading it. Try again in a moment.");
    }

    private Map<String, byte[]> readAll(Long projectId) {
        List<ProjectFile> files = projectFileRepository.findByProjectId(projectId).stream()
                .filter(file -> !skipped(ProjectFilePath.normalize(file.getPath())))
                .toList();
        if (files.size() > properties.maxSourceFiles()) {
            throw new TooLargeException("The project has more than " + properties.maxSourceFiles()
                    + " files, which is more than can be published.");
        }
        Map<String, byte[]> content = new LinkedHashMap<>();
        long total = 0;
        for (ProjectFile file : files) {
            String path = ProjectFilePath.normalize(file.getPath());
            String key = file.getMinioObjectKey() != null ? file.getMinioObjectKey() : ProjectFilePath.objectKey(projectId, path);
            try (InputStream stream = minioClient.getObject(GetObjectArgs.builder().bucket(projectBucket).object(key).build())) {
                byte[] bytes = stream.readNBytes((int) Math.min(Integer.MAX_VALUE, properties.maxSourceBytes() - total + 1));
                total += bytes.length;
                if (total > properties.maxSourceBytes()) {
                    throw new TooLargeException("The project's files add up to more than "
                            + (properties.maxSourceBytes() / (1024 * 1024)) + " MB, which is more than can be published.");
                }
                content.put(path, bytes);
            } catch (TooLargeException e) {
                throw e;
            } catch (Exception e) {
                throw new FileStorageException("Couldn't read " + path + " to publish it", e);
            }
        }
        return content;
    }

    static boolean skipped(String path) {
        return path.startsWith("node_modules/") || path.startsWith(".git/") || path.startsWith("dist/");
    }

    public static Map<String, byte[]> forSharing(Map<String, byte[]> files) {
        Map<String, byte[]> shared = new LinkedHashMap<>();
        files.forEach((path, bytes) -> {
            if (!isEnvironmentFile(path)) shared.put(path, bytes);
        });
        return shared;
    }

    static boolean isEnvironmentFile(String path) {
        String name = path.substring(path.lastIndexOf('/') + 1);
        if (name.equals(".env.example") || name.equals(".env.sample") || name.equals(".env.template")) return false;
        return name.equals(".env") || name.startsWith(".env.");
    }
}
