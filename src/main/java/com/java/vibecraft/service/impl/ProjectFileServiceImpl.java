package com.java.vibecraft.service.impl;

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
import com.java.vibecraft.util.ContentTypeUtils;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.errors.ErrorResponseException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;

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

    @Override
    public FileTreeResponse getFileTree(Long projectId) {
        List<ProjectFile> projectFileList = projectFileRepository.findByProjectId(projectId);
        List<FileNode> projectFileNodes = projectFileMapper.toListOfFileNode(projectFileList);
        return new FileTreeResponse(projectFileNodes);
    }

    @Override
    public FileContentResponse getFileContent(Long projectId, String path) {
        String objectName = projectId + "/" + path;
        try (
                InputStream is = minioClient.getObject(
                        GetObjectArgs.builder()
                                .bucket(projectBucket)
                                .object(objectName)
                                .build())) {

            String content = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            return new FileContentResponse(path, content);
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

        String cleanPath = path.startsWith("/") ? path.substring(1) : path;
        String objectKey = projectId + "/" + cleanPath;

        try {
            byte[] contentBytes = content.getBytes(StandardCharsets.UTF_8);
            InputStream inputStream = new ByteArrayInputStream(contentBytes);
            String contentType = ContentTypeUtils.determineContentType(path);
            // saving the file content
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(projectBucket)
                            .object(objectKey)
                            .stream(inputStream, contentBytes.length, -1)
                            .contentType(contentType)
                            .build());

            // Saving the metaData
            ProjectFile file = projectFileRepository.findByProjectIdAndPath(projectId, cleanPath)
                    .orElseGet(() -> ProjectFile.builder()
                            .project(project)
                            .path(cleanPath)
                            .minioObjectKey(objectKey) // Use the key we generated
                            .createdAt(Instant.now())
                            .build());

            file.setSize((long) contentBytes.length);
            file.setType(contentType);
            file.setUpdatedAt(Instant.now());
            projectFileRepository.save(file);
            log.info("Saved file: {}", objectKey);
        } catch (Exception e) {
            log.error("Failed to save file {}/{}", projectId, cleanPath, e);
            throw new FileStorageException("Failed to save file " + cleanPath, e);
        }

    }

}
