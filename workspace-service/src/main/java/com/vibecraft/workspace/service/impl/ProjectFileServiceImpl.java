package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.dto.code.CodeSearchFileResult;
import com.vibecraft.workspace.dto.code.CodeSearchResponse;
import com.vibecraft.workspace.dto.project.FileContentResponse;
import com.vibecraft.workspace.dto.project.FileNode;
import com.vibecraft.workspace.dto.project.FileTreeResponse;
import com.vibecraft.workspace.dto.project.ProjectZipResult;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.common.error.BadRequestException;
import com.vibecraft.common.error.FileStorageException;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.mapper.ProjectFileMapper;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.ProjectFileService;
import com.vibecraft.workspace.util.CodeSearchScanner;
import com.vibecraft.workspace.util.ProjectFilePath;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.errors.ErrorResponseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * A project's files: metadata in the database, bytes in MinIO.
 *
 * <p>Handles: listing the tree, reading one file, copying a whole project's files inside storage for a fork,
 * building a ZIP, and plain-text search with per-file and overall caps. Writing and deleting a file go through
 * {@link com.vibecraft.workspace.service.RevisionPublisher} instead (CODE_REVIEW.md AI-05), not this class.
 *
 * <p>Every path goes through the shared validator, so a path that could escape the project is rejected before it
 * reaches storage, a ZIP entry name or a preview pod. Reads and writes derive the object key the same way, so they
 * cannot disagree about the same file.
 *
 * <p>A file listed in the database but missing from storage - metadata and bytes disagreeing, which should never
 * happen - is skipped rather than failing the whole operation outright, but it is never skipped silently: forking
 * counts it as a failed copy (the caller rolls the fork back rather than presenting an incomplete one as done), the
 * ZIP export reports every path it could not include, and search distinguishes a file it could not read from one
 * that was searched and simply had no match. Forking copies inside storage rather than downloading bytes, so images
 * and other binaries come through intact.
 */
@Service
@Slf4j
public class ProjectFileServiceImpl implements ProjectFileService {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final MinioClient minioClient;
    private final ProjectFileMapper projectFileMapper;
    private final String projectBucket;

    public ProjectFileServiceImpl(ProjectRepository projectRepository, ProjectFileRepository projectFileRepository,
                                   MinioClient minioClient, ProjectFileMapper projectFileMapper,
                                   @Value("${minio.project-bucket}") String projectBucket) {
        this.projectRepository = projectRepository;
        this.projectFileRepository = projectFileRepository;
        this.minioClient = minioClient;
        this.projectFileMapper = projectFileMapper;
        this.projectBucket = projectBucket;
    }

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
        String cleanPath = ProjectFilePath.normalize(path);
        String objectName = ProjectFilePath.objectKey(projectId, path);
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
    @PreAuthorize("@security.canViewProject(#projectId)")
    public ProjectZipResult buildProjectZip(Long projectId) {
        List<ProjectFile> files = projectFileRepository.findByProjectId(projectId);
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        List<String> missing = new ArrayList<>();

        try (ZipOutputStream zip = new ZipOutputStream(buffer)) {
            for (ProjectFile file : files) {
                String objectName = file.getMinioObjectKey() != null ? file.getMinioObjectKey() : ProjectFilePath.objectKey(projectId, file.getPath());
                try (InputStream is = minioClient.getObject(
                        GetObjectArgs.builder().bucket(projectBucket).object(objectName).build())) {
                    zip.putNextEntry(new ZipEntry(file.getPath()));
                    is.transferTo(zip);
                    zip.closeEntry();
                } catch (ErrorResponseException e) {
                    if (!"NoSuchKey".equals(e.errorResponse().code())) throw e;
                    // Metadata claims this file exists but storage doesn't have it - a real gap, not a normal
                    // outcome, so it is reported rather than silently making the export look complete.
                    log.warn("Skipping file missing from storage while zipping project {}: {}", projectId, objectName);
                    missing.add(file.getPath());
                }
            }
        } catch (Exception e) {
            log.error("Failed to build ZIP for projectId: {}", projectId, e);
            throw new FileStorageException("Failed to build ZIP for project " + projectId, e);
        }

        return new ProjectZipResult(buffer.toByteArray(), List.copyOf(missing));
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
        List<String> unavailable = new ArrayList<>();
        int matchCount = 0;
        boolean truncated = false;

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
                // A searchable file storage could not actually return - distinct from one that was searched and
                // simply had no match, so a caller doesn't read this as a confirmed "no matches here".
                unavailable.add(file.getPath());
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

        return new CodeSearchResponse(needle, results.size(), matchCount, truncated, List.copyOf(results), List.copyOf(unavailable));
    }

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
            return true;
        }
        return type.startsWith("text/")
                || type.equals("application/json")
                || type.equals("image/svg+xml");
    }

    private String readForSearch(Long projectId, ProjectFile file) {
        String objectName = file.getMinioObjectKey() != null
                ? file.getMinioObjectKey()
                : ProjectFilePath.objectKey(projectId, file.getPath());
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(projectBucket).object(objectName).build())) {
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.warn("Skipping unreadable file while searching project {}: {}", projectId, objectName, e);
            return null;
        }
    }

    @Override
    @PreAuthorize("@security.canViewProject(#sourceProjectId)")
    public int copyAllFiles(Long sourceProjectId, Long targetProjectId) {
        Project target = projectRepository.findById(targetProjectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", targetProjectId.toString()));
        int failed = 0;

        for (ProjectFile file : projectFileRepository.findByProjectId(sourceProjectId)) {
            String sourceKey = file.getMinioObjectKey() != null ? file.getMinioObjectKey() : ProjectFilePath.objectKey(sourceProjectId, file.getPath());
            String targetKey = ProjectFilePath.objectKey(targetProjectId, file.getPath());
            try {
                minioClient.copyObject(CopyObjectArgs.builder()
                        .bucket(projectBucket)
                        .object(targetKey)
                        .source(CopySource.builder().bucket(projectBucket).object(sourceKey).build())
                        .build());
            } catch (ErrorResponseException e) {
                if ("NoSuchKey".equals(e.errorResponse().code())) {
                    // Metadata exists but the bytes don't - the fork would silently be missing this file rather
                    // than the copy it claims to be. Counted as a failure so the caller's "any failed -> roll the
                    // fork back" check actually fires instead of presenting an incomplete fork as a complete one.
                    log.warn("Skipping file missing from storage while forking project {}: {}", sourceProjectId, sourceKey);
                    failed++;
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
                    .path(ProjectFilePath.normalize(file.getPath()))
                    .minioObjectKey(targetKey)
                    .size(file.getSize())
                    .type(file.getType())
                    .build());
        }
        return failed;
    }

}
