package com.singularity.workspace.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.dto.project.FileContentResponse;
import com.singularity.workspace.dto.project.SaveFileRequest;
import com.singularity.workspace.dto.project.SaveFileResponse;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.RevisionPublisher;
import com.singularity.workspace.util.ContentHash;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
 * Covers {@link FileEditServiceImpl}: what a save by hand may write, and when it is refused.
 *
 * <p>Handles: a save made against the stored content is published as one {@code MANUAL_EDIT} revision by the caller;
 * a save made against content the file no longer holds is a conflict and publishes nothing; a path the project does
 * not have is not found, so a save can never create a file; a traversing path is rejected before anything is looked
 * up; saving unchanged content writes nothing; and a publish that loses a race or fails is reported, never passed
 * off as saved.
 */
class FileEditServiceImplTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;
    private static final String PATH = "src/App.tsx";
    private static final String STORED = "export default 1";
    private static final String STORED_HASH = hash(STORED);

    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final ProjectFileService projectFileService = mock(ProjectFileService.class);
    private final RevisionPublisher revisionPublisher = mock(RevisionPublisher.class);

    private final FileEditServiceImpl service =
            new FileEditServiceImpl(projectFileRepository, projectFileService, revisionPublisher);

    private static String hash(String text) {
        return ContentHash.sha256Hex(text.getBytes(StandardCharsets.UTF_8));
    }

    private void stubStoredFile() {
        when(projectFileRepository.findByProjectIdAndPath(PROJECT_ID, PATH))
                .thenReturn(Optional.of(ProjectFile.builder().path(PATH).build()));
        when(projectFileService.getFileContent(PROJECT_ID, PATH))
                .thenReturn(new FileContentResponse(PATH, STORED, STORED_HASH));
    }

    private void stubPublish(PublishRevisionResponse.Status status) {
        when(revisionPublisher.publish(eq(PROJECT_ID), any()))
                .thenReturn(new PublishRevisionResponse(31L, status, 31L, List.of(), Map.of()));
    }

    @Test
    @DisplayName("a save made against the stored content is published as one MANUAL_EDIT revision by the caller")
    void savePublishesAManualEdit() {
        stubStoredFile();
        stubPublish(PublishRevisionResponse.Status.APPLIED);

        SaveFileResponse saved = service.saveFile(PROJECT_ID, new SaveFileRequest(PATH, "export default 2", STORED_HASH), USER_ID);

        ArgumentCaptor<PublishRevisionRequest> request = ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(revisionPublisher).publish(eq(PROJECT_ID), request.capture());
        assertThat(request.getValue().source()).isEqualTo("MANUAL_EDIT");
        assertThat(request.getValue().createdByUserId()).isEqualTo(USER_ID);
        assertThat(request.getValue().changes()).singleElement().satisfies(change -> {
            assertThat(change.path()).isEqualTo(PATH);
            assertThat(change.changeType()).isEqualTo(FileChangeDto.ChangeType.EDIT);
            assertThat(change.content()).isEqualTo("export default 2");
        });
        assertThat(saved.hash()).isEqualTo(hash("export default 2"));
        assertThat(saved.revisionId()).isEqualTo(31L);
    }

    @Test
    @DisplayName("a save made against content the file no longer holds is a conflict and publishes nothing")
    void staleSaveIsAConflict() {
        stubStoredFile();

        assertThatThrownBy(() -> service.saveFile(PROJECT_ID, new SaveFileRequest(PATH, "mine", hash("older")), USER_ID))
                .isInstanceOf(ConflictException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("a path the project does not have is not found, so a save never creates a file")
    void unknownPathIsNotFound() {
        when(projectFileRepository.findByProjectIdAndPath(PROJECT_ID, "src/New.tsx")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.saveFile(PROJECT_ID, new SaveFileRequest("src/New.tsx", "x", STORED_HASH), USER_ID))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("a traversing path is rejected before anything is looked up")
    void traversingPathIsRejected() {
        assertThatThrownBy(() -> service.saveFile(PROJECT_ID, new SaveFileRequest("../2/src/App.tsx", "x", STORED_HASH), USER_ID))
                .isInstanceOf(BadRequestException.class);
        verify(projectFileRepository, never()).findByProjectIdAndPath(anyLong(), any());
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("saving content the file already holds writes nothing")
    void unchangedContentWritesNothing() {
        stubStoredFile();

        SaveFileResponse saved = service.saveFile(PROJECT_ID, new SaveFileRequest(PATH, STORED, STORED_HASH), USER_ID);

        assertThat(saved.revisionId()).isNull();
        assertThat(saved.hash()).isEqualTo(STORED_HASH);
        verify(revisionPublisher, never()).publish(anyLong(), any());
    }

    @Test
    @DisplayName("a publish that loses a race is reported as a conflict")
    void lostRaceIsAConflict() {
        stubStoredFile();
        stubPublish(PublishRevisionResponse.Status.CONFLICT);

        assertThatThrownBy(() -> service.saveFile(PROJECT_ID, new SaveFileRequest(PATH, "mine", STORED_HASH), USER_ID))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    @DisplayName("a publish that fails is reported, never passed off as saved")
    void failedPublishIsReported() {
        stubStoredFile();
        stubPublish(PublishRevisionResponse.Status.FAILED);

        assertThatThrownBy(() -> service.saveFile(PROJECT_ID, new SaveFileRequest(PATH, "mine", STORED_HASH), USER_ID))
                .isInstanceOf(FileStorageException.class);
    }
}
