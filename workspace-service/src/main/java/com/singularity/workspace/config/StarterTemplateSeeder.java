package com.singularity.workspace.config;

import com.singularity.workspace.util.ContentTypeUtils;
import io.minio.BucketExistsArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.StatObjectArgs;
import io.minio.StatObjectResponse;
import io.minio.errors.ErrorResponseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

/**
 * Uploads the starter template's own files into MinIO on a fresh instance, so a new project has something to copy
 * from without a manual step.
 *
 * <p>Handles: reading the template's file list from a checked-in {@code MANIFEST.txt} (one relative path per line),
 * then uploading each listed file from the jar's own classpath resources under {@code starter-templates/<name>/} -
 * never a filesystem path, since this has to work identically whether the app runs exploded (tests, an IDE) or
 * packaged as a jar. Skips a file that is already there with the same content, and replaces one whose content has
 * changed, so this is safe to run on every boot regardless of whether the target MinIO already has the template: previously this repo carried no copy of the template at all - it
 * existed only inside one developer's long-lived local MinIO volume - so a fresh server, or `docker compose down -v`
 * against local MinIO, had nothing to seed a first project from.
 *
 * <p>A file already in storage used to be skipped whatever it held, so a change to the template in this repository
 * never reached a server that had been seeded once - every new project there went on starting from the first version,
 * including a default stylesheet that centred and padded the whole page and a placeholder page written in class names
 * the template does not have. The stored copy is now compared with the checked-in one, by size and then by the MD5
 * that object storage reports as its ETag, and replaced when they differ. Nothing is ever removed from storage here,
 * and projects that already exist keep the files they were created with.
 *
 * <p>Best effort on purpose, like {@link StorageBucketInitializer}: a MinIO this can't reach yet doesn't stop the
 * service booting - project creation reports the real problem ("the starter template has no files") when it
 * actually tries to copy a missing one.
 */
@Slf4j
@Component
public class StarterTemplateSeeder implements ApplicationRunner {

    private final MinioClient minioClient;
    private final String templateBucket;
    private final String templateName;

    public StarterTemplateSeeder(MinioClient minioClient,
                                  @Value("${minio.template-bucket}") String templateBucket,
                                  @Value("${minio.template-name}") String templateName) {
        this.minioClient = minioClient;
        this.templateBucket = templateBucket;
        this.templateName = templateName;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            ensureBucketExists();
        } catch (Exception e) {
            log.warn("Couldn't check or create the starter template bucket '{}' at startup ({}); template seeding "
                    + "skipped for this boot", templateBucket, e.getMessage());
            return;
        }

        List<String> manifest;
        try {
            manifest = readManifest();
        } catch (IOException e) {
            log.error("Couldn't read the starter template's own MANIFEST.txt from the classpath - the template "
                    + "resources are missing or corrupted in this build", e);
            return;
        }

        int uploaded = 0;
        for (String relativePath : manifest) {
            try {
                if (uploadIfMissingOrChanged(relativePath)) {
                    uploaded++;
                }
            } catch (Exception e) {
                log.warn("Couldn't seed starter template file '{}' ({}); project creation will report this file "
                        + "missing until it's retried", relativePath, e.getMessage());
            }
        }

        if (uploaded > 0) {
            log.info("Seeded {} starter template file(s) into '{}/{}/'", uploaded, templateBucket, templateName);
        }
    }

    private void ensureBucketExists() throws Exception {
        if (!minioClient.bucketExists(BucketExistsArgs.builder().bucket(templateBucket).build())) {
            minioClient.makeBucket(MakeBucketArgs.builder().bucket(templateBucket).build());
            log.info("Created the MinIO bucket '{}'", templateBucket);
        }
    }

    private boolean uploadIfMissingOrChanged(String relativePath) throws Exception {
        String objectKey = templateName + "/" + relativePath;

        try (InputStream in = new ClassPathResource("starter-templates/" + templateName + "/" + relativePath)
                .getInputStream()) {
            byte[] content = in.readAllBytes();
            if (isStoredUnchanged(objectKey, content)) {
                return false;
            }
            try (InputStream body = new ByteArrayInputStream(content)) {
                minioClient.putObject(PutObjectArgs.builder()
                        .bucket(templateBucket)
                        .object(objectKey)
                        .contentType(ContentTypeUtils.determineContentType(relativePath))
                        .stream(body, content.length, -1)
                        .build());
            }
        }
        return true;
    }

    private boolean isStoredUnchanged(String objectKey, byte[] content) throws Exception {
        StatObjectResponse stored;
        try {
            stored = minioClient.statObject(StatObjectArgs.builder().bucket(templateBucket).object(objectKey).build());
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) {
                return false;
            }
            throw e;
        }
        if (stored == null) {
            return true;
        }
        if (stored.size() != content.length) {
            return false;
        }
        String etag = stored.etag() == null ? "" : stored.etag().replace("\"", "");
        if (etag.isEmpty() || etag.contains("-")) {
            return true;
        }
        return etag.equalsIgnoreCase(HexFormat.of().formatHex(MessageDigest.getInstance("MD5").digest(content)));
    }

    private List<String> readManifest() throws IOException {
        List<String> paths = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource("starter-templates/" + templateName + "/MANIFEST.txt").getInputStream(),
                StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (!line.isEmpty()) {
                    paths.add(line);
                }
            }
        }
        return paths;
    }
}
