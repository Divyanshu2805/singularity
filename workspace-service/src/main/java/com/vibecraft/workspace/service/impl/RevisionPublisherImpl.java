package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.FileChangeDto;
import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.entity.ProjectFileRevisionEntry;
import com.vibecraft.workspace.enums.RevisionChangeType;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.service.RevisionPublisher;
import com.vibecraft.workspace.service.RevisionValidator;
import com.vibecraft.workspace.util.ContentTypeUtils;
import com.vibecraft.workspace.util.ProjectFilePath;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.errors.ErrorResponseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * The AI-05 orchestration: stage every changed path's content immutably, record it as a durable manifest via
 * {@link RevisionManifestStore}, apply it to the live layout, then atomically advance the project's current
 * revision - rolling back everything this call itself applied if any step after staging fails or loses an
 * optimistic-concurrency race.
 *
 * <p>{@code expectedParentRevisionId} on the request is only a fast-fail check against the value read at the very
 * start of this call (a caller with a known-stale base learns immediately, before any storage is touched) - the
 * actual race guard is {@link RevisionManifestStore#applyAndAdvance}'s CAS, compared against that same
 * freshly-read value, not against whatever the caller passed. A null {@code expectedParentRevisionId} skips the
 * fast-fail (the caller has no opinion - today's only caller, the AI generation pipeline, never has a real base to
 * assert) but the CAS still runs, so a genuine concurrent publish during this call's own staging/apply window is
 * still caught.
 *
 * <p>Deliberately not {@code @Transactional} itself, and deliberately not calling {@code @Transactional} methods on
 * itself: every Postgres-only step lives on the separate {@link RevisionManifestStore} bean instead, each its own
 * short transaction bracketing the MinIO calls here, per CODE_REVIEW.md DATA-06 - a transaction must never wrap
 * external I/O it cannot roll back, and a same-class {@code this.method()} call would have silently dropped
 * {@code @Transactional} entirely (Spring's proxy-based AOP only intercepts calls through the bean's proxy).
 */
@Service
@Slf4j
public class RevisionPublisherImpl implements RevisionPublisher {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final RevisionManifestStore manifestStore;
    private final BlobStore blobStore;
    private final List<RevisionValidator> validators;
    private final MinioClient minioClient;
    private final String projectBucket;

    public RevisionPublisherImpl(ProjectRepository projectRepository, ProjectFileRepository projectFileRepository,
                                  RevisionManifestStore manifestStore, BlobStore blobStore,
                                  List<RevisionValidator> validators, MinioClient minioClient,
                                  @Value("${minio.project-bucket}") String projectBucket) {
        this.projectRepository = projectRepository;
        this.projectFileRepository = projectFileRepository;
        this.manifestStore = manifestStore;
        this.blobStore = blobStore;
        this.validators = validators;
        this.minioClient = minioClient;
        this.projectBucket = projectBucket;
    }

    record StagedEntry(String path, RevisionChangeType changeType, String contentHash,
                        String previousContentHash, String previousContent, Long size, String contentType) {
    }

    @Override
    public PublishRevisionResponse publish(Long projectId, PublishRevisionRequest request) {
        Project project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
        Long actualParentId = project.getCurrentFileRevisionId();
        List<String> changedPaths = request.changes().stream().map(FileChangeDto::path).toList();

        if (request.expectedParentRevisionId() != null && !Objects.equals(request.expectedParentRevisionId(), actualParentId)) {
            return new PublishRevisionResponse(null, PublishRevisionResponse.Status.CONFLICT, actualParentId, changedPaths, Map.of());
        }

        List<StagedEntry> staged;
        try {
            staged = stageContent(projectId, request.changes());
        } catch (Exception e) {
            log.error("Failed to stage revision content for projectId: {} - nothing was recorded or applied.", projectId, e);
            return new PublishRevisionResponse(null, PublishRevisionResponse.Status.FAILED, actualParentId, changedPaths, Map.of());
        }

        Map<String, String> previousContent = new LinkedHashMap<>();
        staged.forEach(e -> previousContent.put(e.path(), e.previousContent()));

        Long revisionId;
        try {
            revisionId = manifestStore.stageManifest(projectId, actualParentId, request, staged);
        } catch (Exception e) {
            log.error("Failed to record revision manifest for projectId: {} - staged blobs are orphaned but " +
                    "harmless; nothing was applied.", projectId, e);
            return new PublishRevisionResponse(null, PublishRevisionResponse.Status.FAILED, actualParentId, changedPaths, previousContent);
        }

        ProjectFileRevision revision = manifestStore.findRevision(revisionId);
        List<ProjectFileRevisionEntry> entries = manifestStore.findEntries(revisionId);
        for (RevisionValidator validator : validators) {
            Optional<String> failure = validator.validate(revision, entries);
            if (failure.isPresent()) {
                manifestStore.markFailed(revisionId, failure.get());
                log.warn("Revision {} for projectId: {} rejected by {}: {}", revisionId, projectId,
                        validator.getClass().getSimpleName(), failure.get());
                return new PublishRevisionResponse(revisionId, PublishRevisionResponse.Status.FAILED, actualParentId, changedPaths, previousContent);
            }
        }

        List<StagedEntry> applied = new ArrayList<>();
        for (StagedEntry entry : staged) {
            try {
                applyEntry(projectId, entry);
                applied.add(entry);
            } catch (Exception e) {
                log.error("Failed to apply '{}' for projectId: {} while publishing revision {} - rolling back " +
                        "{} already-applied path(s) in this turn.", entry.path(), projectId, revisionId, applied.size(), e);
                rollback(projectId, applied);
                manifestStore.markFailed(revisionId, "Failed to apply " + entry.path());
                return new PublishRevisionResponse(revisionId, PublishRevisionResponse.Status.FAILED, actualParentId, changedPaths, previousContent);
            }
        }

        boolean won = manifestStore.applyAndAdvance(project, actualParentId, revisionId, staged);
        if (!won) {
            log.warn("Revision {} for projectId: {} lost the publish race - rolling back and marking CONFLICT.", revisionId, projectId);
            rollback(projectId, applied);
            manifestStore.markConflict(revisionId);
            Long realCurrent = manifestStore.currentRevisionOf(projectId, actualParentId);
            return new PublishRevisionResponse(revisionId, PublishRevisionResponse.Status.CONFLICT, realCurrent, changedPaths, previousContent);
        }

        return new PublishRevisionResponse(revisionId, PublishRevisionResponse.Status.APPLIED, revisionId, List.of(), previousContent);
    }

    /**
     * Resolves each change's previous state (adopting a legacy, never-versioned file into the blob store the first
     * time it's touched - see docs/schema/) and uploads every EDIT's new content, all before anything is
     * written to Postgres. Touches only the blob bucket - a failure here leaves the live layout and every table
     * untouched.
     */
    private List<StagedEntry> stageContent(Long projectId, List<FileChangeDto> changes) {
        List<StagedEntry> result = new ArrayList<>();
        for (FileChangeDto change : changes) {
            String cleanPath = ProjectFilePath.normalize(change.path());
            PreviousState previous = resolvePreviousState(projectId, cleanPath);

            if (change.changeType() == FileChangeDto.ChangeType.DELETE) {
                result.add(new StagedEntry(cleanPath, RevisionChangeType.DELETE, null,
                        previous.contentHash(), previous.content(), null, null));
                continue;
            }

            String contentType = ContentTypeUtils.determineContentType(cleanPath);
            byte[] bytes = change.content().getBytes(StandardCharsets.UTF_8);
            String newHash = blobStore.putIfAbsent(bytes, contentType);
            result.add(new StagedEntry(cleanPath, RevisionChangeType.EDIT, newHash,
                    previous.contentHash(), previous.content(), (long) bytes.length, contentType));
        }
        return result;
    }

    private record PreviousState(String contentHash, String content) {
    }

    /**
     * A tracked file's hash is trusted as-is. An untracked-but-existing file (created before GATE-02, or otherwise
     * missing a hash) is adopted on the spot: its current live bytes are read once, hashed, and staged into the blob
     * store so a later rollback has real content to restore. A path with no row at all is new - "" as its previous
     * content, matching the pre-GATE-02 contract {@code previousContentOf} already established.
     */
    private PreviousState resolvePreviousState(Long projectId, String cleanPath) {
        Optional<ProjectFile> existing = projectFileRepository.findByProjectIdAndPath(projectId, cleanPath);
        if (existing.isEmpty()) {
            return new PreviousState(null, "");
        }
        ProjectFile file = existing.get();
        if (file.getContentHash() != null) {
            byte[] bytes = blobStore.read(file.getContentHash());
            return new PreviousState(file.getContentHash(), new String(bytes, StandardCharsets.UTF_8));
        }

        byte[] liveBytes = readLiveBytes(projectId, cleanPath);
        if (liveBytes == null) {
            // Metadata claims this file exists but storage doesn't have it - already a known, tolerated gap
            // elsewhere in this service (ProjectFileServiceImpl's own zip/search paths). Treat as "no previous".
            return new PreviousState(null, "");
        }
        String contentType = file.getType() != null ? file.getType() : ContentTypeUtils.determineContentType(cleanPath);
        String adoptedHash = blobStore.putIfAbsent(liveBytes, contentType);
        return new PreviousState(adoptedHash, new String(liveBytes, StandardCharsets.UTF_8));
    }

    private byte[] readLiveBytes(Long projectId, String cleanPath) {
        String objectName = ProjectFilePath.objectKey(projectId, cleanPath);
        try (var stream = minioClient.getObject(GetObjectArgs.builder().bucket(projectBucket).object(objectName).build())) {
            return stream.readAllBytes();
        } catch (ErrorResponseException e) {
            if ("NoSuchKey".equals(e.errorResponse().code())) return null;
            throw new IllegalStateException("Failed to read live content for " + cleanPath, e);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to read live content for " + cleanPath, e);
        }
    }

    private void applyEntry(Long projectId, StagedEntry entry) {
        if (entry.changeType() == RevisionChangeType.EDIT) {
            blobStore.copyToLivePath(entry.contentHash(), projectId, entry.path());
        } else {
            blobStore.removeLivePath(projectId, entry.path());
        }
    }

    /** Undoes every already-applied entry using its captured previous state - always resolvable, since blobs are never deleted. */
    private void rollback(Long projectId, List<StagedEntry> applied) {
        for (StagedEntry entry : applied) {
            try {
                if (entry.previousContentHash() != null) {
                    blobStore.copyToLivePath(entry.previousContentHash(), projectId, entry.path());
                } else {
                    blobStore.removeLivePath(projectId, entry.path());
                }
            } catch (Exception e) {
                log.error("Rollback itself failed for '{}' on projectId: {} - the live layout may now disagree " +
                        "with project_files until this path is next written.", entry.path(), projectId, e);
            }
        }
    }
}
