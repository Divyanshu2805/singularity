package com.vibecraft.workspace.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers that the project-files bucket is created on a brand-new MinIO, that an existing one is left alone, and that
 * MinIO being unreachable does not stop the service from starting.
 *
 * <p>Nothing else creates that bucket, so without this step every file write on a fresh environment fails until
 * someone makes it by hand.
 */
class StorageBucketInitializerTest {

    private final MinioClient minio = mock(MinioClient.class);
    private final StorageBucketInitializer initializer = new StorageBucketInitializer(minio, "projects");

    @Test
    @DisplayName("a missing bucket is created, under the configured name")
    void createsTheBucketWhenItIsMissing() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);

        initializer.run(null);

        ArgumentCaptor<MakeBucketArgs> made = ArgumentCaptor.forClass(MakeBucketArgs.class);
        verify(minio).makeBucket(made.capture());
        assertThat(made.getValue().bucket()).isEqualTo("projects");
    }

    @Test
    @DisplayName("an existing bucket is left alone")
    void leavesAnExistingBucketAlone() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);

        initializer.run(null);

        verify(minio, never()).makeBucket(any(MakeBucketArgs.class));
    }

    @Test
    @DisplayName("an unreachable MinIO does not stop the service from starting")
    void anUnreachableMinioIsNotFatal() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenThrow(new IOException("connection refused"));

        assertThatCode(() -> initializer.run(null)).doesNotThrowAnyException();
        verify(minio, never()).makeBucket(any(MakeBucketArgs.class));
    }
}
