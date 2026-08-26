package com.vibecraft.workspace.config;

import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import okhttp3.Request;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers {@link StarterTemplateSeeder} against the real checked-in template resources
 * (`starter-templates/react-vite-tailwind-daisyui-starter/`, 15 files per its own MANIFEST.txt) - a fresh MinIO
 * gets every file uploaded, one already present is skipped, and MinIO being unreachable at any point never stops
 * the service booting. Deliberately not mocking the manifest/classpath resources themselves: this is what proves
 * the real manifest still lists exactly the real files that exist, not a fixture that could silently drift from it.
 */
class StarterTemplateSeederTest {

    private static final String TEMPLATE_BUCKET = "starter-projects";
    private static final String TEMPLATE_NAME = "react-vite-tailwind-daisyui-starter";
    private static final int TEMPLATE_FILE_COUNT = 15;

    private final MinioClient minio = mock(MinioClient.class);
    private final StarterTemplateSeeder seeder = new StarterTemplateSeeder(minio, TEMPLATE_BUCKET, TEMPLATE_NAME);

    @Test
    @DisplayName("uploads every manifest-listed file to a fresh, empty MinIO")
    void uploadsEveryFileToAFreshMinio() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        when(minio.statObject(any(StatObjectArgs.class))).thenThrow(noSuchKey());

        seeder.run(null);

        ArgumentCaptor<MakeBucketArgs> madeBucket = ArgumentCaptor.forClass(MakeBucketArgs.class);
        verify(minio).makeBucket(madeBucket.capture());
        assertThat(madeBucket.getValue().bucket()).isEqualTo(TEMPLATE_BUCKET);

        ArgumentCaptor<PutObjectArgs> uploaded = ArgumentCaptor.forClass(PutObjectArgs.class);
        verify(minio, times(TEMPLATE_FILE_COUNT)).putObject(uploaded.capture());
        assertThat(uploaded.getAllValues().stream().map(PutObjectArgs::object))
                .allMatch(key -> key.startsWith(TEMPLATE_NAME + "/"))
                .contains(TEMPLATE_NAME + "/package.json", TEMPLATE_NAME + "/src/App.tsx");
    }

    @Test
    @DisplayName("skips a file that's already there, leaving an existing bucket alone")
    void skipsFilesAlreadyPresentAndLeavesAnExistingBucketAlone() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(true);
        when(minio.statObject(any(StatObjectArgs.class))).thenReturn(null);

        seeder.run(null);

        verify(minio, never()).makeBucket(any(MakeBucketArgs.class));
        verify(minio, never()).putObject(any(PutObjectArgs.class));
    }

    @Test
    @DisplayName("uploads a real content-type per file, not a generic default")
    void setsContentTypePerFile() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        when(minio.statObject(any(StatObjectArgs.class))).thenThrow(noSuchKey());

        seeder.run(null);

        ArgumentCaptor<PutObjectArgs> uploaded = ArgumentCaptor.forClass(PutObjectArgs.class);
        verify(minio, times(TEMPLATE_FILE_COUNT)).putObject(uploaded.capture());
        PutObjectArgs packageJson = uploaded.getAllValues().stream()
                .filter(args -> args.object().endsWith("package.json"))
                .findFirst().orElseThrow();
        assertThat(packageJson.contentType()).isEqualTo("application/json");
    }

    @Test
    @DisplayName("an unreachable MinIO at the bucket-check stage does not stop the service from starting")
    void anUnreachableMinioDuringBucketCheckIsNotFatal() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenThrow(new IOException("connection refused"));

        assertThatCode(() -> seeder.run(null)).doesNotThrowAnyException();
        verify(minio, never()).putObject(any(PutObjectArgs.class));
    }

    @Test
    @DisplayName("one file failing to upload does not stop the rest from being seeded")
    void oneFailedUploadDoesNotStopTheRest() throws Exception {
        when(minio.bucketExists(any(BucketExistsArgs.class))).thenReturn(false);
        when(minio.statObject(any(StatObjectArgs.class))).thenThrow(noSuchKey());
        when(minio.putObject(any(PutObjectArgs.class)))
                .thenThrow(new RuntimeException("disk full"))
                .thenReturn(null);

        assertThatCode(() -> seeder.run(null)).doesNotThrowAnyException();

        verify(minio, times(TEMPLATE_FILE_COUNT)).putObject(any(PutObjectArgs.class));
    }

    private static ErrorResponseException noSuchKey() {
        ErrorResponse errorResponse = new ErrorResponse("NoSuchKey", "not found", "bucket", "object",
                "resource", "req-id", "host-id");
        okhttp3.Response httpResponse = new okhttp3.Response.Builder()
                .request(new Request.Builder().url("http://localhost/object").build())
                .protocol(okhttp3.Protocol.HTTP_1_1)
                .code(404)
                .message("Not Found")
                .build();
        return new ErrorResponseException(errorResponse, httpResponse, "req-id");
    }
}
