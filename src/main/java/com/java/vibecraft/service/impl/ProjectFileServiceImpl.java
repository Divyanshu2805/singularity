package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.code.CodeSearchFileResult;
import com.java.vibecraft.dto.code.CodeSearchResponse;
import com.java.vibecraft.dto.project.FileContentResponse;
import com.java.vibecraft.dto.project.FileNode;
import com.java.vibecraft.dto.project.FileTreeResponse;
import com.java.vibecraft.entity.Project;
import com.java.vibecraft.entity.ProjectFile;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.error.FileStorageException;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.mapper.ProjectFileMapper;
import com.java.vibecraft.repository.ProjectFileRepository;
import com.java.vibecraft.repository.ProjectRepository;
import com.java.vibecraft.service.ProjectFileService;
import com.java.vibecraft.util.CodeSearchScanner;
import com.java.vibecraft.util.ContentTypeUtils;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.errors.ErrorResponseException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
@Slf4j
@RequiredArgsConstructor
public class ProjectFileServiceImpl implements ProjectFileService {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final MinioClient minioClient;
    private final ProjectFileMapper projectFileMapper;

    @Value("${minio.project-bucket}")
    private String projectBucket;

    // Search caps. Per-file keeps one generated file from filling the panel; the total keeps a common word
    // ("import", "const") from returning thousands of rows nobody scrolls through.
    private static final int MAX_MATCHES_PER_FILE = 50;
    private static final int MAX_TOTAL_MATCHES = 300;
    private static final int MAX_QUERY_CHARS = 200;
    private static final long MAX_SEARCHABLE_FILE_BYTES = 1_000_000;

    @Override
    public FileTreeResponse getFileTree(Long projectId) {
        List<ProjectFile> projectFileList = projectFileRepository.findByProjectId(projectId);
        List<FileNode> projectFileNodes = projectFileMapper.toListOfFileNode(projectFileList);
        return new FileTreeResponse(projectFileNodes);
    }

    @Override
    public FileContentResponse getFileContent(Long projectId, String path) {
        String cleanPath = normalizePath(path);
        String objectName = objectKey(projectId, path);
        try (
                InputStream is = minioClient.getObject(
                        GetObjectArgs.builder()
                                .bucket(projectBucket)
                                .object(objectName)
                                .build())) {

            String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return new FileContentResponse(cleanPath, content);
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) {
                log.debug("File not found in storage: {}", objectName);
                throw new ResourceNotFoundException("File", objectName);
            }
            log.error("MinIO error while reading file: {}", objectName, e);
            throw new FileStorageException("Failed to read file content for " + path, e);
        } catch (Exception e) {
            log.error("Unexpected error while reading file: {}", objectName, e);
            throw new FileStorageException("Failed to read file content for " + path, e);
        }
    }

    @Override
    public void saveFile(Long projectId, String path, String content) {
        if (path == null || path.isBlank()) {
            throw new BadRequestException("File path must not be blank");
        }

        Project project = projectRepository.findById(projectId).orElseThrow(
                () -> new ResourceNotFoundException("Project", projectId.toString())
        );

        String cleanPath = normalizePath(path);
        String objectName = objectKey(projectId, path);

        try {
            byte[] contentBytes = content.getBytes(StandardCharsets.UTF_8);
            InputStream inputStream = new ByteArrayInputStream(contentBytes);
            String contentType = ContentTypeUtils.determineContentType(path);
            // saving the file content
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(projectBucket)
                            .object(objectName)
                            .stream(inputStream, contentBytes.length, -1)
                            .contentType(contentType)
                            .build());

            // Saving the metaData
            ProjectFile file = projectFileRepository.findByProjectIdAndPath(projectId, cleanPath)
                    .orElseGet(() -> ProjectFile.builder()
                            .project(project)
                            .path(cleanPath)
                            .minioObjectKey(objectName)
                            .createdAt(Instant.now())
                            .build());

            file.setSize((long) contentBytes.length);
            file.setType(contentType);
            file.setUpdatedAt(Instant.now());
            projectFileRepository.save(file);
            log.info("Saved file: {}", objectName);
        } catch (Exception e) {
            log.error("Failed to save file {}/{}", projectId, cleanPath, e);
            throw new FileStorageException("Failed to save file " + cleanPath, e);
        }

    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public byte[] buildProjectZip(Long projectId) {
        List<ProjectFile> files = projectFileRepository.findByProjectId(projectId);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();

        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            for (ProjectFile file : files) {
                String objectName = file.getMinioObjectKey() != null ? file.getMinioObjectKey() : objectKey(projectId, file.getPath());
                // Open the object before adding the entry, so a missing object is skipped instead of leaving an empty entry.
                try (InputStream is = minioClient.getObject(
                        GetObjectArgs.builder().bucket(projectBucket).object(objectName).build())) {
                    zip.putNextEntry(new ZipEntry(file.getPath()));
                    is.transferTo(zip);
                    zip.closeEntry();
                } catch (ErrorResponseException e) {
                    if (!"NoSuchKey".equals(e.errorResponse().code())) throw e;
                    log.warn("Skipping file missing from storage while zipping project {}: {}", projectId, objectName);
                }
            }
        } catch (Exception e) {
            log.error("Failed to build ZIP for projectId: {}", projectId, e);
            throw new FileStorageException("Failed to build ZIP for project " + projectId, e);
        }

        return buffer.toByteArray();
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public CodeSearchResponse searchFiles(Long projectId, String query) {
        String needle = query == null ? "" : query.strip();
        if (needle.isEmpty()) {
            throw new BadRequestException("Search query must not be blank");
        }
        if (needle.length() > MAX_QUERY_CHARS) {
            throw new BadRequestException("Search query must be at most " + MAX_QUERY_CHARS + " characters");
        }

        List<ProjectFile> files = projectFileRepository.findByProjectId(projectId);
        List<CodeSearchFileResult> results = new ArrayList<>();
        int matchCount = 0;
        boolean truncated = false;

        // Sorted so results come back in a stable, predictable order rather than however the DB returned them.
        files.sort(Comparator.comparing(ProjectFile::getPath, Comparator.nullsLast(Comparator.naturalOrder())));

        for (ProjectFile file : files) {
            if (matchCount >= MAX_TOTAL_MATCHES) {
                truncated = true;
                break;
            }
            if (!isSearchable(file)) {
                continue;
            }

            String content = readForSearch(projectId, file);
            if (content == null) {
                continue;
            }

            int remaining = Math.min(MAX_MATCHES_PER_FILE, MAX_TOTAL_MATCHES - matchCount);
            CodeSearchFileResult result = CodeSearchScanner.scan(file.getPath(), content, needle, remaining);
            if (result == null) {
                continue;
            }
            results.add(result);
            matchCount += result.matches().size();
            truncated |= result.truncated();
        }

        return new CodeSearchResponse(needle, results.size(), matchCount, truncated, List.copyOf(results));
    }

    /** Binaries have no lines worth showing, and a huge file would cost more to scan than the hit is worth. */
    private boolean isSearchable(ProjectFile file) {
        if (file.getPath() == null || file.getPath().isBlank()) {
            return false;
        }
        Long size = file.getSize();
        if (size != null && size > MAX_SEARCHABLE_FILE_BYTES) {
            return false;
        }
        String type = file.getType();
        if (type == null) {
            return true; // Older rows predate the type column; scanning one costs a read, missing it costs a result.
        }
        return type.startsWith("text/")
                || type.equals("application/json")
                || type.equals("image/svg+xml"); // markup, and genuinely searchable
    }

    /** A file that can't be read is skipped rather than failing the whole search - one missing object isn't fatal. */
    private String readForSearch(Long projectId, ProjectFile file) {
        String objectName = file.getMinioObjectKey() != null
                ? file.getMinioObjectKey()
                : objectKey(projectId, file.getPath());
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(projectBucket).object(objectName).build())) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("Skipping unreadable file while searching project {}: {}", projectId, objectName, e);
            return null;
        }
    }

    /**
     * The canonical form of a file path: no leading slash. The AI protocol's {@code <file path="...">} emits
     * both {@code "/src/App.tsx"} and {@code "src/App.tsx"} for the same file, and this is what's stored in
     * {@code ProjectFile.path} and reported by the file tree, so reads and writes must agree on it.
     */
    private static String normalizePath(String path) {
        return path.startsWith("/") ? path.substring(1) : path;
    }

    @Override
    @PreAuthorize("@security.canViewProject(#sourceProjectId)")
    public int copyAllFiles(Long sourceProjectId, Long targetProjectId) {
        Project target = projectRepository.findById(targetProjectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", targetProjectId.toString()));
        int failed = 0;

        for (ProjectFile file : projectFileRepository.findByProjectId(sourceProjectId)) {
            String sourceKey = file.getMinioObjectKey() != null ? file.getMinioObjectKey() : objectKey(sourceProjectId, file.getPath());
            String targetKey = objectKey(targetProjectId, file.getPath());
            try {
                minioClient.copyObject(CopyObjectArgs.builder()
                        .bucket(projectBucket)
                        .object(targetKey)
                        .source(CopySource.builder().bucket(projectBucket).object(sourceKey).build())
                        .build());
            } catch (ErrorResponseException e) {
                if ("NoSuchKey".equals(e.errorResponse().code())) {
                    log.warn("Skipping file missing from storage while forking project {}: {}", sourceProjectId, sourceKey);
                    continue;
                }
                log.error("Failed to copy {} while forking project {}", sourceKey, sourceProjectId, e);
                failed++;
                continue;
            } catch (Exception e) {
                log.error("Failed to copy {} while forking project {}", sourceKey, sourceProjectId, e);
                failed++;
                continue;
            }

            projectFileRepository.save(ProjectFile.builder()
                    .project(target)
                    .path(normalizePath(file.getPath()))
                    .minioObjectKey(targetKey)
                    .size(file.getSize())
                    .type(file.getType())
                    .build());
        }
        return failed;
    }

    /**
     * The MinIO object key for a project file. Every read and write goes through here — {@code getFileContent}
     * used to build the key inline without normalizing, so a path sent with a leading slash produced the key
     * {@code "22//src/App.tsx"} and 404'd a file that {@code saveFile} had stored at {@code "22/src/App.tsx"}.
     */
    private static String objectKey(Long projectId, String path) {
        return projectId + "/" + normalizePath(path);
    }

}
