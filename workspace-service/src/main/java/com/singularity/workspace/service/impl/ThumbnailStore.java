package com.singularity.workspace.service.impl;

import com.singularity.common.error.FileStorageException;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.errors.ErrorResponseException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.Optional;

/**
 * Where a project's picture is kept in object storage.
 *
 * <p>Handles: writing a project's one picture, replacing whatever was there, and reading it back.
 *
 * <p>One object per project, at {@code thumbnail/<project id>} in the blob bucket. The blob bucket and not the
 * project's own: a runner's syncer mirrors everything under a project's prefix into the preview, and a picture of
 * the app must not arrive inside the app. A fixed key and not a content hash like the blobs beside it: a picture is
 * replaced each time the app changes and no earlier one is ever asked for again, so keeping them would only be
 * waste. The key is made from the project's id, a number, and nothing a caller typed.
 */
@Component
public class ThumbnailStore {

    private static final String PREFIX = "thumbnail/";

    private final MinioClient minioClient;
    private final String bucket;

    public ThumbnailStore(MinioClient minioClient, @Value("${minio.blob-bucket}") String bucket) {
        this.minioClient = minioClient;
        this.bucket = bucket;
    }

    public void put(long projectId, byte[] bytes, String contentType) {
        try (InputStream stream = new ByteArrayInputStream(bytes)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key(projectId))
                    .stream(stream, bytes.length, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception e) {
            throw new FileStorageException("Failed to store the picture of project " + projectId, e);
        }
    }

    public Optional<byte[]> read(long projectId) {
        try (InputStream stream = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(key(projectId)).build())) {
            return Optional.of(stream.readAllBytes());
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) {
                return Optional.empty();
            }
            throw new FileStorageException("Failed to read the picture of project " + projectId, e);
        } catch (Exception e) {
            throw new FileStorageException("Failed to read the picture of project " + projectId, e);
        }
    }

    static String key(long projectId) {
        return PREFIX + projectId;
    }
}
