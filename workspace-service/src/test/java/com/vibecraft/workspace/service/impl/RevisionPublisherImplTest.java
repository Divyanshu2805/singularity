package com.vibecraft.workspace.service.impl;

import com.vibecraft.common.dto.FileChangeDto;
import com.vibecraft.common.dto.PublishRevisionRequest;
import com.vibecraft.common.dto.PublishRevisionResponse;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.service.RevisionValidator;
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-05's orchestration in {@link RevisionPublisherImpl}: staging happens before anything is
 * durably recorded, a manifest exists before anything is applied, an apply failure rolls back exactly what this
 * call itself applied and marks the revision FAILED without ever reaching the CAS, and a lost CAS race rolls back
 * the same way and marks CONFLICT. {@link RevisionManifestStore} and {@link BlobStore} are both mocked here - the
 * real Postgres CAS/transaction behavior these orchestrate is proven separately in
 * {@code RevisionPublisherIntegrationTest} against a real database.
 */
class RevisionPublisherImplTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final RevisionManifestStore manifestStore = mock(RevisionManifestStore.class);
    private final BlobStore blobStore = mock(BlobStore.class);
    private final MinioClient minioClient = mock(MinioClient.class);

    private final RevisionPublisherImpl publisher = new RevisionPublisherImpl(
            projectRepository, projectFileRepository, manifestStore, blobStore, List.<RevisionValidator>of(),
            minioClient, "projects");

    @BeforeEach
    void stubProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).build()));
        when(projectFileRepository.findByProjectIdAndPath(eq(PROJECT_ID), any())).thenReturn(Optional.empty());
    }

    private PublishRevisionRequest requestFor(FileChangeDto... changes) {
        return new PublishRevisionRequest(null, USER_ID, "AI_GENERATION", List.of(changes));
    }

    private FileChangeDto edit(String path, String content) {
        return new FileChangeDto(path, FileChangeDto.ChangeType.EDIT, content);
    }

    @Test
    @DisplayName("every file staged and applied successfully publishes as APPLIED")
    void happyPathAppliesEveryFile() {
        when(blobStore.putIfAbsent(any(), any())).thenReturn("h1", "h2", "h3");
        when(manifestStore.stageManifest(eq(PROJECT_ID), any(), any(), any())).thenReturn(100L);
        when(manifestStore.applyAndAdvance(any(), any(), eq(100L), any())).thenReturn(true);

        PublishRevisionResponse response = publisher.publish(PROJECT_ID,
                requestFor(edit("a.tsx", "1"), edit("b.tsx", "2"), edit("c.tsx", "3")));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
        assertThat(response.revisionId()).isEqualTo(100L);
        assertThat(response.currentRevisionId()).isEqualTo(100L);
        assertThat(response.failedPaths()).isEmpty();
        verify(blobStore).copyToLivePath("h1", PROJECT_ID, "a.tsx");
        verify(blobStore).copyToLivePath("h2", PROJECT_ID, "b.tsx");
        verify(blobStore).copyToLivePath("h3", PROJECT_ID, "c.tsx");
    }

    @Test
    @DisplayName("a failure applying the second file rolls back the first and never reaches the CAS")
    void secondFileFailureRollsBackTheFirst() {
        ProjectFile existing = ProjectFile.builder().path("a.tsx").contentHash("old-a-hash").build();
        when(projectFileRepository.findByProjectIdAndPath(PROJECT_ID, "a.tsx")).thenReturn(Optional.of(existing));
        when(blobStore.read("old-a-hash")).thenReturn("old content".getBytes(StandardCharsets.UTF_8));
        when(blobStore.putIfAbsent(any(), any())).thenReturn("new-a-hash", "new-b-hash");
        when(manifestStore.stageManifest(eq(PROJECT_ID), any(), any(), any())).thenReturn(200L);
        doThrow(new RuntimeException("storage unavailable"))
                .when(blobStore).copyToLivePath("new-b-hash", PROJECT_ID, "b.tsx");

        PublishRevisionResponse response = publisher.publish(PROJECT_ID, requestFor(edit("a.tsx", "new"), edit("b.tsx", "new")));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.FAILED);
        assertThat(response.failedPaths()).containsExactlyInAnyOrder("a.tsx", "b.tsx");

        InOrder order = inOrder(blobStore, manifestStore);
        order.verify(blobStore).copyToLivePath("new-a-hash", PROJECT_ID, "a.tsx");
        order.verify(blobStore).copyToLivePath("new-b-hash", PROJECT_ID, "b.tsx");
        order.verify(blobStore).copyToLivePath("old-a-hash", PROJECT_ID, "a.tsx");
        order.verify(manifestStore).markFailed(eq(200L), any());
        verify(manifestStore, never()).applyAndAdvance(any(), any(), anyLong(), any());
    }

    @Test
    @DisplayName("a rollback for a brand-new file (no previous content) removes the live path instead of copying")
    void rollbackOfANewFileRemovesRatherThanCopies() {
        when(blobStore.putIfAbsent(any(), any())).thenReturn("new-hash", "new-b-hash");
        when(manifestStore.stageManifest(eq(PROJECT_ID), any(), any(), any())).thenReturn(201L);
        doThrow(new RuntimeException("storage unavailable"))
                .when(blobStore).copyToLivePath("new-b-hash", PROJECT_ID, "b.tsx");

        publisher.publish(PROJECT_ID, requestFor(edit("new.tsx", "content"), edit("b.tsx", "content")));

        verify(blobStore).removeLivePath(PROJECT_ID, "new.tsx");
    }

    @Test
    @DisplayName("a MinIO failure while staging never creates a manifest row")
    void stagingFailureCreatesNoManifest() {
        when(blobStore.putIfAbsent(any(), any())).thenThrow(new RuntimeException("MinIO unreachable"));

        PublishRevisionResponse response = publisher.publish(PROJECT_ID, requestFor(edit("a.tsx", "1")));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.FAILED);
        assertThat(response.revisionId()).isNull();
        verify(manifestStore, never()).stageManifest(any(), any(), any(), any());
    }

    @Test
    @DisplayName("a DB failure recording the manifest never applies anything to the live layout")
    void manifestFailureNeverApplies() {
        when(blobStore.putIfAbsent(any(), any())).thenReturn("h1");
        when(manifestStore.stageManifest(eq(PROJECT_ID), any(), any(), any()))
                .thenThrow(new RuntimeException("connection to Postgres refused"));

        PublishRevisionResponse response = publisher.publish(PROJECT_ID, requestFor(edit("a.tsx", "1")));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.FAILED);
        assertThat(response.revisionId()).isNull();
        verify(blobStore, never()).copyToLivePath(any(), any(), any());
        verify(blobStore, never()).removeLivePath(any(), any());
    }

    @Test
    @DisplayName("losing the CAS race rolls back the applied entry and reports CONFLICT with the real current revision")
    void losingTheCasRaceRollsBackAndReportsConflict() {
        ProjectFile existing = ProjectFile.builder().path("a.tsx").contentHash("old-hash").build();
        when(projectFileRepository.findByProjectIdAndPath(PROJECT_ID, "a.tsx")).thenReturn(Optional.of(existing));
        when(blobStore.read("old-hash")).thenReturn("old".getBytes(StandardCharsets.UTF_8));
        when(blobStore.putIfAbsent(any(), any())).thenReturn("new-hash");
        when(manifestStore.stageManifest(eq(PROJECT_ID), any(), any(), any())).thenReturn(300L);
        when(manifestStore.applyAndAdvance(any(), any(), eq(300L), any())).thenReturn(false);
        when(manifestStore.currentRevisionOf(eq(PROJECT_ID), any())).thenReturn(99L);

        PublishRevisionResponse response = publisher.publish(PROJECT_ID, requestFor(edit("a.tsx", "new")));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.CONFLICT);
        assertThat(response.currentRevisionId()).isEqualTo(99L);
        assertThat(response.failedPaths()).containsExactly("a.tsx");
        verify(blobStore).copyToLivePath("old-hash", PROJECT_ID, "a.tsx");
        verify(manifestStore).markConflict(300L);
    }

    @Test
    @DisplayName("a stale expected parent revision fails fast, before any staging or storage call")
    void staleExpectedParentFailsFastWithNoStaging() {
        when(projectRepository.findById(PROJECT_ID))
                .thenReturn(Optional.of(Project.builder().id(PROJECT_ID).currentFileRevisionId(50L).build()));

        PublishRevisionResponse response = publisher.publish(PROJECT_ID,
                new PublishRevisionRequest(1L, USER_ID, "MANUAL_EDIT", List.of(edit("a.tsx", "x"))));

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.CONFLICT);
        assertThat(response.currentRevisionId()).isEqualTo(50L);
        verify(blobStore, never()).putIfAbsent(any(), any());
        verify(manifestStore, never()).stageManifest(any(), any(), any(), any());
    }
}
