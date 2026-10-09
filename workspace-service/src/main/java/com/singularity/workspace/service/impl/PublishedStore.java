package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.FileStorageException;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.util.ProjectFilePath;
import io.minio.CopyObjectArgs;
import io.minio.CopySource;
import io.minio.GetObjectArgs;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import io.minio.RemoveObjectArgs;
import io.minio.RemoveObjectsArgs;
import io.minio.Result;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.DeleteError;
import io.minio.messages.DeleteObject;
import io.minio.messages.Item;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * The published-apps bucket: where a build's files, the sources it was built from, and the pointer that makes a build
 * live are kept.
 *
 * <p>Layout, inside the bucket: {@code <name>/current.json} is the pointer; {@code <name>/b<N>/site/<path>} is build
 * N's files and {@code <name>/b<N>/src/<path>} the sources it was built from. A build's prefix ({@code b<N>/}) is what
 * the database holds. Writing the pointer is what puts a build live and deleting it is what takes an app down, so those
 * two are single object operations and never part of a larger one.
 *
 * <p>Handles: writing a set of files under a build, writing and removing the pointer, listing and reading a build's
 * sources (for the share page and a fork), copying one source object into a project's own bucket, and deleting a build
 * prefix or a whole app. Every path written or read here goes through {@link ProjectFilePath} first, so a key is never
 * built from a string a pod or a visitor chose.
 *
 * <p>The proxy reads this bucket with a read-only user and builds a key as {@code <name>/<prefix from the pointer><path>}
 * itself - the shape of {@link #pointerKey} and the pointer's {@code prefix} field are a contract with proxy/published.js.
 */
@Component
@Slf4j
public class PublishedStore {

    static final String POINTER_FILE = "current.json";
    static final String SITE = "site/";
    static final String SOURCES = "src/";
    private static final String DEFAULT_CONTENT_TYPE = "application/octet-stream";

    public record StoredFile(String path, long size) {
    }

    private final MinioClient minioClient;
    private final String bucket;

    public PublishedStore(MinioClient minioClient, PublishingProperties properties) {
        this.minioClient = minioClient;
        this.bucket = properties.bucket();
    }

    public static String buildPrefix(long buildNumber) {
        return "b" + buildNumber + "/";
    }

    public static String pointerKey(String slug) {
        return slug + "/" + POINTER_FILE;
    }

    static String sitePrefixOf(String buildPrefix) {
        return buildPrefix + SITE;
    }

    public void putSite(String slug, String buildPrefix, Map<String, byte[]> files) {
        putAll(slug, buildPrefix + SITE, files);
    }

    public void putSources(String slug, String buildPrefix, Map<String, byte[]> files) {
        putAll(slug, buildPrefix + SOURCES, files);
    }

    private void putAll(String slug, String relativePrefix, Map<String, byte[]> files) {
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            put(slug + "/" + relativePrefix + ProjectFilePath.normalize(file.getKey()), file.getValue());
        }
    }

    public void writePointer(String slug, String buildPrefix, long buildNumber, Instant publishedAt) {
        String json = "{\"v\":1,\"prefix\":\"" + sitePrefixOf(buildPrefix) + "\",\"build\":" + buildNumber
                + ",\"publishedAt\":\"" + publishedAt + "\"}";
        put(pointerKey(slug), json.getBytes(StandardCharsets.UTF_8), "application/json");
    }

    public void deletePointer(String slug) {
        try {
            minioClient.removeObject(RemoveObjectArgs.builder().bucket(bucket).object(pointerKey(slug)).build());
        } catch (Exception e) {
            throw new FileStorageException("Couldn't take down the published app " + slug, e);
        }
    }

    public List<StoredFile> listSources(String slug, String buildPrefix) {
        String prefix = slug + "/" + buildPrefix + SOURCES;
        List<StoredFile> files = new ArrayList<>();
        try {
            for (Result<Item> result : minioClient.listObjects(
                    ListObjectsArgs.builder().bucket(bucket).prefix(prefix).recursive(true).build())) {
                Item item = result.get();
                if (item.isDir()) continue;
                files.add(new StoredFile(item.objectName().substring(prefix.length()), item.size()));
            }
        } catch (Exception e) {
            throw new FileStorageException("Couldn't list the sources of " + slug, e);
        }
        return files;
    }

    public Optional<byte[]> readSource(String slug, String buildPrefix, String path, int maxBytes) {
        String key = slug + "/" + buildPrefix + SOURCES + ProjectFilePath.normalize(path);
        try (InputStream stream = minioClient.getObject(GetObjectArgs.builder().bucket(bucket).object(key).build())) {
            byte[] content = stream.readNBytes(maxBytes + 1);
            if (content.length > maxBytes) {
                throw new BadRequestException("The file " + path + " is too large to show here.");
            }
            return Optional.of(content);
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) return Optional.empty();
            throw new FileStorageException("Couldn't read " + path + " of " + slug, e);
        } catch (BadRequestException e) {
            throw e;
        } catch (Exception e) {
            throw new FileStorageException("Couldn't read " + path + " of " + slug, e);
        }
    }

    public void copySourceTo(String slug, String buildPrefix, String path, String targetBucket, String targetKey) {
        String key = slug + "/" + buildPrefix + SOURCES + ProjectFilePath.normalize(path);
        try {
            minioClient.copyObject(CopyObjectArgs.builder()
                    .bucket(targetBucket)
                    .object(targetKey)
                    .source(CopySource.builder().bucket(bucket).object(key).build())
                    .build());
        } catch (Exception e) {
            throw new FileStorageException("Couldn't copy " + path + " of " + slug, e);
        }
    }

    /** The build prefixes ({@code b<N>/}) stored for an app, in no particular order. */
    public List<String> listBuildPrefixes(String slug) {
        String prefix = slug + "/";
        List<String> builds = new ArrayList<>();
        try {
            for (Result<Item> result : minioClient.listObjects(
                    ListObjectsArgs.builder().bucket(bucket).prefix(prefix).recursive(false).build())) {
                Item item = result.get();
                if (!item.isDir()) continue;
                String name = item.objectName().substring(prefix.length());
                if (name.matches("b\\d+/")) builds.add(name);
            }
        } catch (Exception e) {
            throw new FileStorageException("Couldn't list the builds of " + slug, e);
        }
        return builds;
    }

    public void deleteBuild(String slug, String buildPrefix) {
        deletePrefix(slug + "/" + buildPrefix);
    }

    public void deleteApp(String slug) {
        deletePrefix(slug + "/");
    }

    private void deletePrefix(String prefix) {
        try {
            List<DeleteObject> keys = new ArrayList<>();
            for (Result<Item> result : minioClient.listObjects(
                    ListObjectsArgs.builder().bucket(bucket).prefix(prefix).recursive(true).build())) {
                keys.add(new DeleteObject(result.get().objectName()));
            }
            if (keys.isEmpty()) return;
            for (Result<DeleteError> result : minioClient.removeObjects(
                    RemoveObjectsArgs.builder().bucket(bucket).objects(keys).build())) {
                DeleteError error = result.get();
                log.warn("Couldn't delete {} from the published-apps bucket: {}", error.objectName(), error.message());
            }
        } catch (Exception e) {
            throw new FileStorageException("Couldn't delete " + prefix + " from the published-apps bucket", e);
        }
    }

    private void put(String key, byte[] content) {
        put(key, content, DEFAULT_CONTENT_TYPE);
    }

    private void put(String key, byte[] content, String contentType) {
        try (InputStream stream = new ByteArrayInputStream(content)) {
            minioClient.putObject(PutObjectArgs.builder()
                    .bucket(bucket)
                    .object(key)
                    .stream(stream, content.length, -1)
                    .contentType(contentType)
                    .build());
        } catch (Exception e) {
            throw new FileStorageException("Couldn't store " + key, e);
        }
    }
}
