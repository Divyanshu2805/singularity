package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.error.FileStorageException;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.util.ContentHash;
import com.vibecraft.workspace.util.ProjectFilePath;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.errors.ErrorResponseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.io.InputStream;

@Service
@Slf4j
public class BlobStoreImpl implements BlobStore {

    private static final String BLOB_PREFIX = "blob/";

    private final MinioClient minioClient;
    private final String projectBucket;
    private final String blobBucket;

    public BlobStoreImpl(MinioClient minioClient,
                          @Value("${minio.project-bucket}") String projectBucket,
                          @Value("${minio.blob-bucket}") String blobBucket) {
        this.minioClient = minioClient;
        this.projectBucket = projectBucket;
        this.blobBucket = blobBucket;
    }

    @Override
    public String putIfAbsent(byte[] content, String contentType) {
        String hash = ContentHash.sha256Hex(content);
        String key = blobKey(hash);
        try {
            minioClient.statObject(StatObjectArgs.builder().bucket(blobBucket).object(key).build());
            return hash;
        } catch (ErrorResponseException e) {
            if (!"NoSuchKey".equals(e.errorResponse().code())) {
                throw new FileStorageException("Failed to check for existing blob " + hash, e);
            }
        } catch (Exception e) {
            throw new FileStorageException("Failed to check for existing blob " + hash, e);
        }

        try (InputStream stream = new ByteArrayInputStream(content)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(blobBucket)
                    .object(key)
                    .stream(stream, content.length, -1)
                    .contentType(contentType)
                    .build());
            return hash;
        } catch (Exception e) {
            throw new FileStorageException("Failed to stage blob " + hash, e);
        }
    }

    @Override
    public byte[] read(String contentHash) {
        try (InputStream stream = minioClient.getObject(
                GetObjectArgs.builder().bucket(blobBucket).object(blobKey(contentHash)).build())) {
            return stream.readAllBytes();
        } catch (Exception e) {
            throw new FileStorageException("Failed to read blob " + contentHash, e);
        }
    }

    @Override
    public void copyToLivePath(String contentHash, Long projectId, String path) {
        String targetKey = ProjectFilePath.objectKey(projectId, path);
        try {
            minioClient.copyObject(CopyObjectArgs.builder()
                    .bucket(projectBucket)
                    .object(targetKey)
                    .source(CopySource.builder().bucket(blobBucket).object(blobKey(contentHash)).build())
                    .build());
        } catch (Exception e) {
            throw new FileStorageException("Failed to materialize blob " + contentHash + " to " + path, e);
        }
    }

    @Override
    public void removeLivePath(Long projectId, String path) {
        String key = ProjectFilePath.objectKey(projectId, path);
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(projectBucket).object(key).build());
        } catch (Exception e) {
            throw new FileStorageException("Failed to remove " + path, e);
        }
    }

    private static String blobKey(String contentHash) {
        return BLOB_PREFIX + contentHash;
    }
}
