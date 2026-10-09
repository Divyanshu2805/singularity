package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.dto.revision.RevisionFileChange;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.entity.ProjectFileRevisionEntry;
import com.singularity.workspace.entity.ProjectFileRevision;
import com.singularity.workspace.enums.RevisionStatus;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectFileRevisionEntryRepository;
import com.singularity.workspace.repository.ProjectFileRevisionRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.BlobStore;
import com.singularity.workspace.service.RevisionPublisher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers {@link RevisionServiceImpl}'s restore-point check: {@code preview} and {@code restore} must reject a
 * revision id that belongs to a different project, doesn't exist, or never reached {@code APPLIED} - before any
 * snapshot is reconstructed or anything is published. The controller's {@code @PreAuthorize} only proves access to
 * the project in the path, so without this an editor of their own project could restore another project's files
 * into it by passing that project's (sequential, guessable) revision id. Also pins that a legitimate restore still
 * publishes a {@code RESTORE} revision against the project's current revision.
 *
 * <p>Also covers what a restore puts back. The starter template's files have no revision of their own, so the tests
 * pin that a file no revision ever changed is left alone, that a template file first changed after the restore point
 * goes back to its original content instead of being deleted, that a file created after the restore point is
 * removed, that restoring to before a revision uses its parent, and that the project's first revision can be undone
 * from the original content alone. The list is pinned to carry each revision's changed paths.
 */
class RevisionServiceImplTest {

    private static final long PROJECT_ID = 1L;
    private static final long OTHER_PROJECT_ID = 2L;
    private static final long REVISION_ID = 12L;
    private static final long PARENT_REVISION_ID = 11L;
    private static final long CURRENT_REVISION_ID = 15L;
    private static final long USER_ID = 7L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final ProjectFileRevisionRepository revisionRepository = mock(ProjectFileRevisionRepository.class);
    private final ProjectFileRevisionEntryRepository entryRepository = mock(ProjectFileRevisionEntryRepository.class);
    private final BlobStore blobStore = mock(BlobStore.class);
    private final RevisionPublisher revisionPublisher = mock(RevisionPublisher.class);
    private static final long RESTORE_REVISION_ID = 77L;
    private final RevisionSnapshotReader snapshotReader = mock(RevisionSnapshotReader.class);

    private final RevisionServiceImpl service = new RevisionServiceImpl(
            projectRepository, projectFileRepository, revisionRepository, entryRepository, blobStore, revisionPublisher,
            snapshotReader);

    @BeforeEach
    void stubProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(
                Project.builder().id(PROJECT_ID).currentFileRevisionId(CURRENT_REVISION_ID).build()));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of());
    }

    private void stubRevision(long projectId, RevisionStatus status) {
        when(revisionRepository.findById(REVISION_ID)).thenReturn(Optional.of(ProjectFileRevision.builder()
                .id(REVISION_ID).projectId(projectId).status(status).parentRevisionId(PARENT_REVISION_ID).build()));
    }

    private static ProjectFileRevisionRepository.SnapshotRow row(String path, String hash, String changeType) {
        ProjectFileRevisionRepository.SnapshotRow row = mock(ProjectFileRevisionRepository.SnapshotRow.class);
        when(row.getPath()).thenReturn(path);
        when(row.getContentHash()).thenReturn(hash);
        when(row.getChangeType()).thenReturn(changeType);
        return row;
    }

    private static ProjectFile file(String path, String hash) {
        return ProjectFile.builder().path(path).contentHash(hash).build();
    }

    private Map<String, RevisionFileChange.ChangeKind> previewKinds(boolean before) {
        return service.preview(PROJECT_ID, REVISION_ID, before).changes().stream()
                .collect(Collectors.toMap(RevisionFileChange::path, RevisionFileChange::kind));
    }

    @Test
    @DisplayName("preview rejects a revision that belongs to another project")
    void previewRejectsAnotherProjectsRevision() {
        stubRevision(OTHER_PROJECT_ID, RevisionStatus.APPLIED);

        assertThatThrownBy(() -> service.preview(PROJECT_ID, REVISION_ID, false))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionRepository, never()).reconstructSnapshot(anyLong());
    }

    @Test
    @DisplayName("restore rejects a revision that belongs to another project, publishing nothing")
    void restoreRejectsAnotherProjectsRevision() {
        stubRevision(OTHER_PROJECT_ID, RevisionStatus.APPLIED);

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, false, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionRepository, never()).reconstructSnapshot(anyLong());
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("restore rejects a revision id that doesn't exist")
    void restoreRejectsUnknownRevision() {
        when(revisionRepository.findById(REVISION_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, false, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = RevisionStatus.class, names = "APPLIED", mode = EnumSource.Mode.EXCLUDE)
    @DisplayName("restore rejects a revision of this project that never became a project state")
    void restoreRejectsNonAppliedRevision(RevisionStatus status) {
        stubRevision(PROJECT_ID, status);

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, false, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("restore of this project's applied revision publishes a RESTORE revision against the current one")
    void restoreOfOwnAppliedRevisionPublishes() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        List<ProjectFileRevisionRepository.SnapshotRow> snapshot = List.of(row("src/App.tsx", "abc", "EDIT"));
        when(revisionRepository.reconstructSnapshot(REVISION_ID)).thenReturn(snapshot);
        when(blobStore.read("abc")).thenReturn("export default 1".getBytes(StandardCharsets.UTF_8));

        when(revisionPublisher.publish(eq(PROJECT_ID), any())).thenReturn(new com.singularity.common.dto.PublishRevisionResponse(
                RESTORE_REVISION_ID, com.singularity.common.dto.PublishRevisionResponse.Status.APPLIED, RESTORE_REVISION_ID, List.of(), Map.of()));

        service.restore(PROJECT_ID, REVISION_ID, false, USER_ID);

        verify(revisionRepository).recordRestoreTarget(PROJECT_ID, RESTORE_REVISION_ID, REVISION_ID, false);
        ArgumentCaptor<PublishRevisionRequest> request = ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(revisionPublisher).publish(eq(PROJECT_ID), request.capture());
        assertThat(request.getValue().source()).isEqualTo("RESTORE");
        assertThat(request.getValue().expectedParentRevisionId()).isEqualTo(CURRENT_REVISION_ID);
        assertThat(request.getValue().changes()).singleElement()
                .satisfies(change -> assertThat(change.path()).isEqualTo("src/App.tsx"));
    }

    @Test
    @DisplayName("a file no revision has ever changed is left alone by a restore")
    void restoreLeavesNeverChangedFilesAlone() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        List<ProjectFileRevisionRepository.SnapshotRow> snapshot = List.of(row("src/App.tsx", "abc", "EDIT"));
        when(revisionRepository.reconstructSnapshot(REVISION_ID)).thenReturn(snapshot);
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
                file("package.json", null), file("src/App.tsx", "abc")));

        assertThat(previewKinds(false)).isEmpty();
    }

    @Test
    @DisplayName("a template file first changed after the restore point goes back to its original content")
    void restorePutsBackOriginalContent() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        List<ProjectFileRevisionRepository.SnapshotRow> snapshot = List.of(row("src/App.tsx", "abc", "EDIT"));
        List<ProjectFileRevisionRepository.SnapshotRow> original = List.of(
                row("src/App.tsx", "template-app", "EDIT"),
                row("src/index.css", "template-css", "EDIT"),
                row("src/pages/New.tsx", null, "EDIT"));
        when(revisionRepository.reconstructSnapshot(REVISION_ID)).thenReturn(snapshot);
        when(revisionRepository.findOriginalContent(PROJECT_ID)).thenReturn(original);
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
                file("src/App.tsx", "abc"), file("src/index.css", "later-css"), file("src/pages/New.tsx", "new")));

        assertThat(previewKinds(false)).containsOnly(
                Map.entry("src/index.css", RevisionFileChange.ChangeKind.MODIFIED),
                Map.entry("src/pages/New.tsx", RevisionFileChange.ChangeKind.DELETED));
    }

    @Test
    @DisplayName("a file the restore point had deleted stays deleted, whatever it first contained")
    void restoreKeepsADeletionMadeBeforeTheRestorePoint() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        List<ProjectFileRevisionRepository.SnapshotRow> snapshot = List.of(row("src/Old.tsx", null, "DELETE"));
        List<ProjectFileRevisionRepository.SnapshotRow> original = List.of(row("src/Old.tsx", "template-old", "DELETE"));
        when(revisionRepository.reconstructSnapshot(REVISION_ID)).thenReturn(snapshot);
        when(revisionRepository.findOriginalContent(PROJECT_ID)).thenReturn(original);

        assertThat(previewKinds(false)).isEmpty();
    }

    @Test
    @DisplayName("restoring to before a revision uses its parent's state")
    void restoreBeforeUsesTheParent() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        List<ProjectFileRevisionRepository.SnapshotRow> snapshot = List.of(row("src/App.tsx", "older", "EDIT"));
        when(revisionRepository.reconstructSnapshot(PARENT_REVISION_ID)).thenReturn(snapshot);
        when(blobStore.read("older")).thenReturn("export default 0".getBytes(StandardCharsets.UTF_8));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("src/App.tsx", "abc")));

        when(revisionPublisher.publish(eq(PROJECT_ID), any())).thenReturn(new com.singularity.common.dto.PublishRevisionResponse(
                RESTORE_REVISION_ID, com.singularity.common.dto.PublishRevisionResponse.Status.APPLIED, RESTORE_REVISION_ID, List.of(), Map.of()));

        service.restore(PROJECT_ID, REVISION_ID, true, USER_ID);

        verify(revisionRepository).recordRestoreTarget(PROJECT_ID, RESTORE_REVISION_ID, REVISION_ID, true);
        verify(revisionRepository, never()).reconstructSnapshot(REVISION_ID);
        ArgumentCaptor<PublishRevisionRequest> request = ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(revisionPublisher).publish(eq(PROJECT_ID), request.capture());
        assertThat(request.getValue().changes()).singleElement()
                .satisfies(change -> assertThat(change.content()).isEqualTo("export default 0"));
    }

    @Test
    @DisplayName("the project's first revision is undone from the original content alone")
    void firstRevisionCanBeUndone() {
        when(revisionRepository.findById(REVISION_ID)).thenReturn(Optional.of(ProjectFileRevision.builder()
                .id(REVISION_ID).projectId(PROJECT_ID).status(RevisionStatus.APPLIED).build()));
        List<ProjectFileRevisionRepository.SnapshotRow> original = List.of(
                row("src/App.tsx", "template-app", "EDIT"), row("src/pages/Todo.tsx", null, "EDIT"));
        when(revisionRepository.findOriginalContent(PROJECT_ID)).thenReturn(original);
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
                file("package.json", null), file("src/App.tsx", "abc"), file("src/pages/Todo.tsx", "todo")));

        assertThat(previewKinds(true)).containsOnly(
                Map.entry("src/App.tsx", RevisionFileChange.ChangeKind.MODIFIED),
                Map.entry("src/pages/Todo.tsx", RevisionFileChange.ChangeKind.DELETED));
        verify(revisionRepository, never()).reconstructSnapshot(anyLong());
    }

    @Test
    @DisplayName("the list carries the paths each revision changed")
    void listCarriesChangedPaths() {
        when(revisionRepository.findByProjectIdOrderByIdDesc(PROJECT_ID)).thenReturn(List.of(
                ProjectFileRevision.builder().id(13L).projectId(PROJECT_ID).status(RevisionStatus.APPLIED).build(),
                ProjectFileRevision.builder().id(12L).projectId(PROJECT_ID).status(RevisionStatus.APPLIED).build()));
        when(entryRepository.findByRevisionIdIn(List.of(13L, 12L))).thenReturn(List.of(
                ProjectFileRevisionEntry.builder().revisionId(12L).path("src/b.tsx").build(),
                ProjectFileRevisionEntry.builder().revisionId(12L).path("src/a.tsx").build()));

        var revisions = service.listRevisions(PROJECT_ID);

        assertThat(revisions.get(0).changedPaths()).isEmpty();
        assertThat(revisions.get(1).changedPaths()).containsExactly("src/a.tsx", "src/b.tsx");
    }
}
