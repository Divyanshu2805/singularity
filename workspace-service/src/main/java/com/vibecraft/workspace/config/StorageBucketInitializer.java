package com.vibecraft.workspace.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Makes sure every bucket this service writes to exists before anything writes to it.
 *
 * <p>Handles: creating the configured project-files and revision-blob (CODE_REVIEW.md AI-05) buckets at startup if
 * either is missing, so a brand-new MinIO with an empty data volume works without a manual step. Idempotent - an
 * existing bucket is left alone.
 *
 * <p>Best effort on purpose: if MinIO cannot be reached at startup the service still boots, and the first file
 * operation reports the problem rather than the boot failing.
 */
@Slf4j
@Component
public class StorageBucketInitializer implements ApplicationRunner {

    private final MinioClient minioClient;
    private final List<String> buckets;

    public StorageBucketInitializer(MinioClient minioClient,
                                     @Value("${minio.project-bucket}") String projectBucket,
                                     @Value("${minio.blob-bucket}") String blobBucket) {
        this.minioClient = minioClient;
        this.buckets = List.of(projectBucket, blobBucket);
    }

    @Override
    public void run(ApplicationArguments args) {
        buckets.forEach(this::ensureBucketExists);
    }

    private void ensureBucketExists(String bucket) {
        try {
            if (minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucket).build())) {
                return;
            }
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucket).build());
            log.info("Created the MinIO bucket '{}'", bucket);
        } catch (Exception e) {
            log.warn("Couldn't check or create the MinIO bucket '{}' at startup ({}); file storage will fail until "
                    + "MinIO is reachable and the bucket exists", bucket, e.getMessage());
        }
    }
}
