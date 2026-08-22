package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.dto.code.CodeSearchResponse;
import com.vibecraft.workspace.dto.project.ProjectZipResult;
import com.vibecraft.workspace.entity.Project;
import com.vibecraft.workspace.entity.ProjectFile;
import com.vibecraft.workspace.mapper.ProjectFileMapper;
import com.vibecraft.workspace.repository.ProjectFileRepository;
import com.vibecraft.workspace.repository.ProjectRepository;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import io.minio.errors.ErrorResponseException;
import io.minio.messages.ErrorResponse;
import okhttp3.Request;
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
 * Covers CODE_REVIEW.md DATA-05 for {@link ProjectFileServiceImpl}: fork/zip/search must never present an
 * incomplete result as a complete one. The concurrent-metadata-write coverage this class used to carry for
 * {@code saveFile} (DATA-01) moved with the write path itself to {@code RevisionPublisherImplTest} - and the CAS in
 * {@code ProjectRepository.casAdvanceCurrentRevision} now serializes every write to a project's files per project
 * (CODE_REVIEW.md AI-05), so the specific "two inserts race for one path" scenario DATA-01 fixed can no longer
 * happen the way it used to.
 */
class ProjectFileServiceImplTest {

    private static final long PROJECT_ID = 1L;
    private static final long TARGET_PROJECT_ID = 2L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final MinioClient minioClient = mock(MinioClient.class);
    private final ProjectFileMapper projectFileMapper = mock(ProjectFileMapper.class);

    private final ProjectFileServiceImpl service = new ProjectFileServiceImpl(
            projectRepository, projectFileRepository, minioClient, projectFileMapper, "projects");

    @BeforeEach
    void stubProjects() {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).build()));
        when(projectRepository.findById(TARGET_PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(TARGET_PROJECT_ID).build()));
    }

    private ProjectFile projectFile(String path) {
        return ProjectFile.builder().path(path).minioObjectKey("projects/" + PROJECT_ID + "/" + path).build();
    }

    private ErrorResponseException noSuchKey() {
        ErrorResponse errorResponse = new ErrorResponse("NoSuchKey", "not found", "bucket", "obj", "resource", "req-id", "host-id");
        okhttp3.Response httpResponse = new okhttp3.Response.Builder()
                .request(new Request.Builder().url("http://localhost/obj").build())
                .protocol(okhttp3.Protocol.HTTP_1_1)
                .code(404)
                .message("Not Found")
                .build();
        return new ErrorResponseException(errorResponse, httpResponse, "req-id");
    }

    @Test
    void forkingCountsAMissingSourceObjectAsAFailedCopyNotASilentSkip() throws Exception {
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(projectFile("missing.tsx")));
        when(minioClient.copyObject(any())).thenThrow(noSuchKey());

        int failed = service.copyAllFiles(PROJECT_ID, TARGET_PROJECT_ID);

        assertThat(failed).isEqualTo(1);
        verify(projectFileRepository, never()).save(any());
    }

    @Test
    void buildingAZipReportsWhicheverFilesStorageDidNotActuallyHave() throws Exception {
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(projectFile("gone.tsx")));
        when(minioClient.getObject(any())).thenThrow(noSuchKey());

        ProjectZipResult result = service.buildProjectZip(PROJECT_ID);

        assertThat(result.isComplete()).isFalse();
        assertThat(result.missingPaths()).containsExactly("gone.tsx");
    }

    @Test
    void searchDistinguishesAnUnreadableFileFromOneWithNoMatches() throws Exception {
        ProjectFile unreadable = projectFile("broken.tsx");
        ProjectFile clean = projectFile("clean.tsx");
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(new java.util.ArrayList<>(List.of(unreadable, clean)));
        GetObjectResponse cleanStream = streamOf("nothing interesting here");
        when(minioClient.getObject(argThatMatchesObject("broken.tsx"))).thenThrow(new RuntimeException("storage hiccup"));
        when(minioClient.getObject(argThatMatchesObject("clean.tsx"))).thenReturn(cleanStream);

        CodeSearchResponse response = service.searchFiles(PROJECT_ID, "needle");

        assertThat(response.unavailablePaths()).containsExactly("broken.tsx");
        assertThat(response.matchCount()).isZero();
        assertThat(response.files()).isEmpty();
    }

    private io.minio.GetObjectArgs argThatMatchesObject(String suffix) {
        return org.mockito.ArgumentMatchers.argThat(args -> args != null && args.object().endsWith(suffix));
    }

    private GetObjectResponse streamOf(String content) {
        GetObjectResponse response = mock(GetObjectResponse.class);
        try {
            when(response.readAllBytes()).thenReturn(content.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
        return response;
    }
}
