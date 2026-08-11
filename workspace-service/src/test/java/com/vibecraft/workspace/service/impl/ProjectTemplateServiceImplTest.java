package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import com.vibecraft.workspace.service.TemplateInitResult;
import io.minio.ListObjectsArgs;
import io.minio.MinioClient;
import io.minio.Result;
import io.minio.messages.Item;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md DATA-03: a starter template listing that comes back with zero objects - the template bucket
 * or name misconfigured, or genuinely empty - used to be indistinguishable from "nothing needed doing" and produced
 * a silently "complete" project with no files and no error.
 */
class ProjectTemplateServiceImplTest {

    private static final long PROJECT_ID = 1L;

    private final MinioClient minioClient = mock(MinioClient.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);

    private final ProjectTemplateServiceImpl service = new ProjectTemplateServiceImpl(
            minioClient, projectFileRepository, projectRepository, "projects", "starter-projects", "react-starter");

    @BeforeEach
    void stubProject() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).build()));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of());
    }

    private Item item(String path, long size) {
        Item item = mock(Item.class);
        when(item.objectName()).thenReturn("react-starter/" + path);
        when(item.size()).thenReturn(size);
        return item;
    }

    @SafeVarargs
    private void listingReturns(Result<Item>... results) {
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenReturn(List.of(results));
    }

    @Test
    void copiesEveryFileTheListingReturns() {
        listingReturns(new Result<>(item("src/App.tsx", 100)), new Result<>(item("package.json", 50)));

        TemplateInitResult result = service.initializeProjectFromTemplate(PROJECT_ID);

        assertThat(result.isComplete()).isTrue();
        assertThat(result.copiedCount()).isEqualTo(2);
    }

    @Test
    void anEmptyListingIsTreatedAsAFailureNotAVacuousSuccess() {
        listingReturns();

        TemplateInitResult result = service.initializeProjectFromTemplate(PROJECT_ID);

        assertThat(result.isComplete()).isFalse();
        assertThat(result.copiedCount()).isZero();
        assertThat(result.failedPaths()).isNotEmpty();
        // Retried MAX_ATTEMPTS (3) times since it never becomes complete.
        verify(minioClient, org.mockito.Mockito.times(3)).listObjects(any(ListObjectsArgs.class));
    }

    @Test
    void aListingThatThrowsIsReportedAsIncompleteNotSilentlyEmpty() {
        when(minioClient.listObjects(any(ListObjectsArgs.class))).thenThrow(new RuntimeException("MinIO unreachable"));

        TemplateInitResult result = service.initializeProjectFromTemplate(PROJECT_ID);

        assertThat(result.isComplete()).isFalse();
        assertThat(result.copiedCount()).isZero();
    }

    @Test
    void filesAlreadyPresentAreSkippedWithoutCountingAsCopiedOrFailed() throws Exception {
        when(projectFileRepository.findByProjectId(PROJECT_ID))
                .thenReturn(List.of(com.vibecraft.workspace.entity.ProjectFile.builder().path("src/App.tsx").build()));
        listingReturns(new Result<>(item("src/App.tsx", 100)));

        TemplateInitResult result = service.initializeProjectFromTemplate(PROJECT_ID);

        assertThat(result.isComplete()).isTrue();
        assertThat(result.copiedCount()).isZero();
        assertThat(result.skippedCount()).isEqualTo(1);
        verify(minioClient, never()).copyObject(any());
    }

    @Test
    void aFailureOnOneFileIsReportedWithoutStoppingTheOthers() throws Exception {
        when(minioClient.copyObject(any())).thenThrow(new RuntimeException("copy failed"));
        listingReturns(new Result<>(item("broken.tsx", 10)));

        TemplateInitResult result = service.initializeProjectFromTemplate(PROJECT_ID);

        assertThat(result.isComplete()).isFalse();
        assertThat(result.failedPaths()).contains("broken.tsx");
    }
}
