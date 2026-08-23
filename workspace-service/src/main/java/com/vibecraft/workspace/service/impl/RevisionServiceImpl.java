package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.FileChangeDto;
import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.dto.revision.RevisionFileChange;
import com.vibecraft.workspace.dto.revision.RevisionPreviewResponse;
import com.vibecraft.workspace.dto.revision.RevisionSummaryResponse;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.enums.RevisionSource;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.service.RevisionPublisher;
import com.vibecraft.workspace.service.RevisionService;
import lombok.RequiredArgsConstructor;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class RevisionServiceImpl implements RevisionService {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectFileRevisionRepository revisionRepository;
    private final BlobStore blobStore;
    private final RevisionPublisher revisionPublisher;

    @Override
    public List<RevisionSummaryResponse> listRevisions(Long projectId) {
        return revisionRepository.findByProjectIdOrderByIdDesc(projectId).stream()
                .map(this::toSummary)
                .toList();
    }

    @Override
    public RevisionPreviewResponse preview(Long projectId, Long revisionId) {
        return new RevisionPreviewResponse(revisionId, diffAgainstCurrent(projectId, targetSnapshot(revisionId)));
    }

    @Override
    public Map<String, String> snapshot(Long revisionId) {
        return targetSnapshot(revisionId);
    }

    @Override
    public PublishRevisionResponse restore(Long projectId, Long revisionId, Long userId) {
        var project = projectRepository.findById(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
        Map<String, String> target = targetSnapshot(revisionId);
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
        return revisionPublisher.publish(projectId, request);
    }

    /** path -> content hash, for every path that exists (not deleted) as of the given revision. */
    private Map<String, String> targetSnapshot(Long revisionId) {
        Map<String, String> snapshot = new LinkedHashMap<>();
        for (var row : revisionRepository.reconstructSnapshot(revisionId)) {
            if (!"DELETE".equals(row.getChangeType())) {
                snapshot.put(row.getPath(), row.getContentHash());
            }
        }
        return snapshot;
    }

    /**
     * A current file with no tracked hash (never touched since GATE-02 shipped) is conservatively reported
     * MODIFIED rather than silently treated as unchanged - a real hash comparison isn't possible for it yet, and
     * overstating a diff is far safer than a preview or restore that misses a real difference.
     */
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
        current.keySet().stream()
                .filter(path -> !target.containsKey(path))
                .forEach(path -> changes.add(new RevisionFileChange(path, RevisionFileChange.ChangeKind.DELETED)));
        return changes;
    }

    private RevisionSummaryResponse toSummary(ProjectFileRevision revision) {
        return new RevisionSummaryResponse(revision.getId(), revision.getParentRevisionId(), revision.getStatus(),
                revision.getSource(), revision.getCreatedByUserId(), revision.getCreatedAt(), revision.getAppliedAt());
    }
}
