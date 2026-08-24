package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.error.ResourceNotFoundException;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.enums.RevisionStatus;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectFileRevisionRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.service.RevisionPublisher;
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
 */
class RevisionServiceImplTest {

    private static final long PROJECT_ID = 1L;
    private static final long OTHER_PROJECT_ID = 2L;
    private static final long REVISION_ID = 12L;
    private static final long CURRENT_REVISION_ID = 15L;
    private static final long USER_ID = 7L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final ProjectFileRevisionRepository revisionRepository = mock(ProjectFileRevisionRepository.class);
    private final BlobStore blobStore = mock(BlobStore.class);
    private final RevisionPublisher revisionPublisher = mock(RevisionPublisher.class);
    private final RevisionSnapshotReader snapshotReader = mock(RevisionSnapshotReader.class);

    private final RevisionServiceImpl service = new RevisionServiceImpl(
            projectRepository, projectFileRepository, revisionRepository, blobStore, revisionPublisher, snapshotReader);

    @BeforeEach
    void stubProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(
                Project.builder().id(PROJECT_ID).currentFileRevisionId(CURRENT_REVISION_ID).build()));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of());
    }

    private void stubRevision(long projectId, RevisionStatus status) {
        when(revisionRepository.findById(REVISION_ID)).thenReturn(Optional.of(
                ProjectFileRevision.builder().id(REVISION_ID).projectId(projectId).status(status).build()));
    }

    @Test
    @DisplayName("preview rejects a revision that belongs to another project")
    void previewRejectsAnotherProjectsRevision() {
        stubRevision(OTHER_PROJECT_ID, RevisionStatus.APPLIED);

        assertThatThrownBy(() -> service.preview(PROJECT_ID, REVISION_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(snapshotReader, never()).snapshot(anyLong());
    }

    @Test
    @DisplayName("restore rejects a revision that belongs to another project, publishing nothing")
    void restoreRejectsAnotherProjectsRevision() {
        stubRevision(OTHER_PROJECT_ID, RevisionStatus.APPLIED);

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(snapshotReader, never()).snapshot(anyLong());
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("restore rejects a revision id that doesn't exist")
    void restoreRejectsUnknownRevision() {
        when(revisionRepository.findById(REVISION_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = RevisionStatus.class, names = "APPLIED", mode = EnumSource.Mode.EXCLUDE)
    @DisplayName("restore rejects a revision of this project that never became a project state")
    void restoreRejectsNonAppliedRevision(RevisionStatus status) {
        stubRevision(PROJECT_ID, status);

        assertThatThrownBy(() -> service.restore(PROJECT_ID, REVISION_ID, USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("restore of this project's applied revision publishes a RESTORE revision against the current one")
    void restoreOfOwnAppliedRevisionPublishes() {
        stubRevision(PROJECT_ID, RevisionStatus.APPLIED);
        when(snapshotReader.snapshot(REVISION_ID)).thenReturn(Map.of("src/App.tsx", "abc"));
        when(blobStore.read("abc")).thenReturn("export default 1".getBytes(StandardCharsets.UTF_8));

        service.restore(PROJECT_ID, REVISION_ID, USER_ID);

        ArgumentCaptor<PublishRevisionRequest> request = ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(revisionPublisher).publish(eq(PROJECT_ID), request.capture());
        assertThat(request.getValue().source()).isEqualTo("RESTORE");
        assertThat(request.getValue().expectedParentRevisionId()).isEqualTo(CURRENT_REVISION_ID);
        assertThat(request.getValue().changes()).singleElement()
                .satisfies(change -> assertThat(change.path()).isEqualTo("src/App.tsx"));
    }
}
