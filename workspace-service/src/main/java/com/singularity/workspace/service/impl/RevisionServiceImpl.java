package com.singularity.workspace.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.dto.revision.RevisionFileChange;
import com.singularity.workspace.dto.revision.RevisionPreviewResponse;
import com.singularity.workspace.dto.revision.RevisionSummaryResponse;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.entity.ProjectFileRevision;
import com.singularity.workspace.entity.ProjectFileRevisionEntry;
import com.singularity.workspace.enums.RevisionSource;
import com.singularity.workspace.enums.RevisionStatus;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectFileRevisionEntryRepository;
import com.singularity.workspace.repository.ProjectFileRevisionRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.BlobStore;
import com.singularity.workspace.service.RevisionPublisher;
import com.singularity.workspace.service.RevisionService;
import lombok.RequiredArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A project's revision history: listing it, previewing a restore, and restoring (CODE_REVIEW.md AI-05).
 *
 * <p>Handles: listing a project's revisions newest first, each with the paths it changed; working out what the
 * project held at a revision, or just before it, and diffing that against the project's current files; and restoring
 * to either by publishing that diff as a new forward-only
 * {@code RESTORE} revision through {@link RevisionPublisher}, the same pipeline as every other write.
 *
 * <p>Invariant: {@code preview} and {@code restore} only accept a revision that belongs to the given project and is
 * {@code APPLIED}; anything else is a 404. The controller's {@code @PreAuthorize} only proves access to
 * {@code projectId}, and revision ids are sequential, so without this check an editor of their own project could
 * pass another project's revision id and restore that project's files into theirs, then read them - a cross-tenant
 * read of private source. A {@code FAILED}/{@code CONFLICT}/{@code STAGING} revision never became a project state,
 * so it is not a restore point either. {@code snapshot} stays unchecked: its only caller is the internal build
 * validator, handing it a revision it just staged itself.
 *
 * <p>What a project held at a revision is more than that revision's snapshot. The starter template's files, and the
 * files a fork copied, are written with no revision of their own, so a snapshot holds only the paths some revision
 * has changed. Restoring from the snapshot alone would have deleted every file no revision had touched
 * (package.json, the whole component kit) and deleted, rather than put back, a template file first changed after the
 * restore point. So the state restored to is the snapshot laid over each path's original content - the previous hash
 * its first revision recorded - and a current file with no hash at all, which no revision has ever changed, is left
 * exactly as it is. Asked for the state before a revision, it is the same thing built from that revision's parent,
 * and from the original content alone when the revision was the project's first - which is how the first build can
 * be undone. That was found when the History panel was built; until then nothing had called restore.
 *
 * <p>The actual snapshot reconstruction lives in {@link RevisionSnapshotReader}, a separate leaf bean with no
 * dependency on {@link RevisionPublisher} - this class depends on {@code RevisionPublisher} itself (for
 * {@code restore}), and {@code RevisionPublisherImpl} depends on every {@code RevisionValidator}, including the one
 * that needs a snapshot; folding reconstruction into this class instead closed a real Spring bean-wiring cycle
 * that only surfaced on an actual boot, since no test here boots a real context.
 */
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class RevisionServiceImpl implements RevisionService {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectFileRevisionRepository revisionRepository;
    private final ProjectFileRevisionEntryRepository entryRepository;
    private final BlobStore blobStore;
    private final RevisionPublisher revisionPublisher;
    private final RevisionSnapshotReader snapshotReader;

    @Override
    public List<RevisionSummaryResponse> listRevisions(Long projectId) {
        List<ProjectFileRevision> revisions = revisionRepository.findByProjectIdOrderByIdDesc(projectId);
        Map<Long, List<String>> pathsByRevision = new HashMap<>();
        if (!revisions.isEmpty()) {
            for (ProjectFileRevisionEntry entry : entryRepository.findByRevisionIdIn(
                    revisions.stream().map(ProjectFileRevision::getId).toList())) {
                pathsByRevision.computeIfAbsent(entry.getRevisionId(), id -> new ArrayList<>()).add(entry.getPath());
            }
        }
        return revisions.stream()
                .map(revision -> toSummary(revision, pathsByRevision.getOrDefault(revision.getId(), List.of())))
                .toList();
    }

    @Override
    public RevisionPreviewResponse preview(Long projectId, Long revisionId, boolean before) {
        ProjectFileRevision revision = requireRestorePoint(projectId, revisionId);
        return new RevisionPreviewResponse(revisionId, diffAgainstCurrent(projectId, stateFor(revision, before)));
    }

    @Override
    public Map<String, String> snapshot(Long revisionId) {
        return snapshotReader.snapshot(revisionId);
    }

    @Override
    public PublishRevisionResponse restore(Long projectId, Long revisionId, boolean before, Long userId) {
        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
        Map<String, String> target = stateFor(requireRestorePoint(projectId, revisionId), before);
        List<RevisionFileChange> diff = diffAgainstCurrent(projectId, target);

        List<FileChangeDto> changes = new ArrayList<>();
        for (RevisionFileChange change : diff) {
            if (change.kind() == RevisionFileChange.ChangeKind.DELETED) {
                changes.add(new FileChangeDto(change.path(), FileChangeDto.ChangeType.DELETE, null));
            } else {
                String content = new String(blobStore.read(target.get(change.path())), StandardCharsets.UTF_8);
                changes.add(new FileChangeDto(change.path(), FileChangeDto.ChangeType.EDIT, content));
            }
        }

        PublishRevisionRequest request = new PublishRevisionRequest(
                project.getCurrentFileRevisionId(), userId, RevisionSource.RESTORE.name(), changes);
        PublishRevisionResponse published = revisionPublisher.publish(projectId, request);
        if (published.status() == PublishRevisionResponse.Status.APPLIED && published.revisionId() != null) {
            revisionRepository.recordRestoreTarget(projectId, published.revisionId(), revisionId, before);
        }
        return published;
    }

    private Map<String, String> stateFor(ProjectFileRevision revision, boolean before) {
        Long revisionId = before ? revision.getParentRevisionId() : revision.getId();
        Map<String, String> state = new LinkedHashMap<>();
        Set<String> decided = new HashSet<>();
        if (revisionId != null) {
            for (var row : revisionRepository.reconstructSnapshot(revisionId)) {
                decided.add(row.getPath());
                if (!"DELETE".equals(row.getChangeType())) {
                    state.put(row.getPath(), row.getContentHash());
                }
            }
        }
        for (var row : revisionRepository.findOriginalContent(revision.getProjectId())) {
            if (!decided.contains(row.getPath()) && row.getContentHash() != null) {
                state.put(row.getPath(), row.getContentHash());
            }
        }
        return state;
    }

    private ProjectFileRevision requireRestorePoint(Long projectId, Long revisionId) {
        return revisionRepository.findById(revisionId)
                .filter(revision -> projectId.equals(revision.getProjectId()))
                .filter(revision -> revision.getStatus() == RevisionStatus.APPLIED)
                .orElseThrow(() -> new ResourceNotFoundException("Revision", revisionId.toString()));
    }

    private List<RevisionFileChange> diffAgainstCurrent(Long projectId, Map<String, String> target) {
        Map<String, String> current = new LinkedHashMap<>();
        for (ProjectFile file : projectFileRepository.findByProjectId(projectId)) {
            current.put(file.getPath(), file.getContentHash());
        }

        List<RevisionFileChange> changes = new ArrayList<>();
        target.forEach((path, hash) -> {
            if (!current.containsKey(path)) {
                changes.add(new RevisionFileChange(path, RevisionFileChange.ChangeKind.ADDED));
            } else if (current.get(path) == null || !current.get(path).equals(hash)) {
                changes.add(new RevisionFileChange(path, RevisionFileChange.ChangeKind.MODIFIED));
            }
        });
        current.entrySet().stream()
                .filter(file -> file.getValue() != null && !target.containsKey(file.getKey()))
                .map(Map.Entry::getKey)
                .forEach(path -> changes.add(new RevisionFileChange(path, RevisionFileChange.ChangeKind.DELETED)));
        return changes;
    }

    private RevisionSummaryResponse toSummary(ProjectFileRevision revision, List<String> changedPaths) {
        return new RevisionSummaryResponse(revision.getId(), revision.getParentRevisionId(), revision.getStatus(),
                revision.getSource(), revision.getCreatedByUserId(), revision.getCreatedAt(), revision.getAppliedAt(),
                changedPaths.stream().sorted().toList(), revision.getRestoredRevisionId(), revision.getRestoredBefore());
    }
}
