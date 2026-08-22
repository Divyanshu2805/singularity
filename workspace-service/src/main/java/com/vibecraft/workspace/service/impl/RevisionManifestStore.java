package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.entity.ProjectFileRevisionEntry;
import com.vibecraft.workspace.enums.RevisionChangeType;
import com.vibecraft.workspace.enums.RevisionSource;
import com.vibecraft.workspace.enums.RevisionStatus;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionEntryRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.util.ProjectFilePath;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Every Postgres-only step of a revision publish (CODE_REVIEW.md AI-05), each its own short transaction, with no
 * MinIO call inside any of them (CODE_REVIEW.md DATA-06). Kept as a separate bean from {@code RevisionPublisherImpl}
 * rather than {@code protected @Transactional} methods on it: Spring's proxy-based {@code @Transactional} only
 * intercepts calls that arrive through the bean's proxy, so a same-class {@code this.method()} call would silently
 * run with no transaction at all - a real, easy-to-miss trap this split avoids entirely.
 */
@Service
@RequiredArgsConstructor
public class RevisionManifestStore {

    private final ProjectRepository projectRepository;
    private final ProjectFileRepository projectFileRepository;
    private final ProjectFileRevisionRepository revisionRepository;
    private final ProjectFileRevisionEntryRepository entryRepository;

    @Transactional
    public Long stageManifest(Long projectId, Long parentRevisionId, PublishRevisionRequest request,
                               List<RevisionPublisherImpl.StagedEntry> staged) {
        ProjectFileRevision revision = revisionRepository.save(ProjectFileRevision.builder()
                .projectId(projectId)
                .parentRevisionId(parentRevisionId)
                .status(RevisionStatus.STAGING)
                .source(RevisionSource.valueOf(request.source()))
                .createdByUserId(request.createdByUserId())
                .build());

        for (RevisionPublisherImpl.StagedEntry entry : staged) {
            entryRepository.save(ProjectFileRevisionEntry.builder()
                    .revisionId(revision.getId())
                    .path(entry.path())
                    .changeType(entry.changeType())
                    .contentHash(entry.contentHash())
                    .previousContentHash(entry.previousContentHash())
                    .size(entry.size())
                    .contentType(entry.contentType())
                    .build());
        }
        return revision.getId();
    }

    public ProjectFileRevision findRevision(Long revisionId) {
        return revisionRepository.findById(revisionId).orElseThrow();
    }

    public List<ProjectFileRevisionEntry> findEntries(Long revisionId) {
        return entryRepository.findByRevisionId(revisionId);
    }

    /**
     * The atomic publish point: a single-statement CAS on {@code projects.current_file_revision_id}, and - only if
     * it wins - the {@code project_files} upsert for every changed path, in the same short transaction. The MinIO
     * apply step has already finished by the time this runs.
     */
    @Transactional
    public boolean applyAndAdvance(Project project, Long expectedParentId, Long revisionId,
                                    List<RevisionPublisherImpl.StagedEntry> staged) {
        int rows = projectRepository.casAdvanceCurrentRevision(project.getId(), expectedParentId, revisionId);
        if (rows == 0) {
            return false;
        }

        for (RevisionPublisherImpl.StagedEntry entry : staged) {
            if (entry.changeType() == RevisionChangeType.DELETE) {
                projectFileRepository.findByProjectIdAndPath(project.getId(), entry.path())
                        .ifPresent(projectFileRepository::delete);
                continue;
            }
            ProjectFile file = projectFileRepository.findByProjectIdAndPath(project.getId(), entry.path())
                    .orElseGet(() -> ProjectFile.builder()
                            .project(project)
                            .path(entry.path())
                            .createdAt(Instant.now())
                            .build());
            file.setMinioObjectKey(ProjectFilePath.objectKey(project.getId(), entry.path()));
            file.setSize(entry.size());
            file.setType(entry.contentType());
            file.setContentHash(entry.contentHash());
            file.setCurrentRevisionId(revisionId);
            file.setUpdatedAt(Instant.now());
            projectFileRepository.save(file);
        }

        revisionRepository.findById(revisionId).ifPresent(revision -> {
            revision.setStatus(RevisionStatus.APPLIED);
            revision.setAppliedAt(Instant.now());
            revisionRepository.save(revision);
        });
        return true;
    }

    @Transactional
    public void markFailed(Long revisionId, String detail) {
        revisionRepository.findById(revisionId).ifPresent(revision -> {
            revision.setStatus(RevisionStatus.FAILED);
            revision.setFailureDetail(detail);
            revisionRepository.save(revision);
        });
    }

    @Transactional
    public void markConflict(Long revisionId) {
        revisionRepository.findById(revisionId).ifPresent(revision -> {
            revision.setStatus(RevisionStatus.CONFLICT);
            revisionRepository.save(revision);
        });
    }

    public Long currentRevisionOf(Long projectId, Long fallback) {
        return projectRepository.findById(projectId).map(Project::getCurrentFileRevisionId).orElse(fallback);
    }
}
