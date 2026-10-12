package com.singularity.workspace.service.impl;

import com.singularity.workspace.dto.code.CodeSearchResponse;
import com.singularity.workspace.dto.project.ProjectZipResult;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.mapper.ProjectFileMapper;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectRepository;
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

    private static java.util.Map<String, String> entriesOf(byte[] zipBytes) throws Exception {
        java.util.Map<String, String> entries = new java.util.LinkedHashMap<>();
        try (java.util.zip.ZipInputStream zip = new java.util.zip.ZipInputStream(new java.io.ByteArrayInputStream(zipBytes))) {
            for (java.util.zip.ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                entries.put(entry.getName(), new String(zip.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            }
        }
        return entries;
    }

    @Test
    void aZipCarriesAReadmeForTheProjectInItAndAGitignoreWhenTheProjectHasNeither() throws Exception {
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).name("Noughts").build()));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
                projectFile("package.json"), projectFile("start.mjs"), projectFile("server/index.ts"), projectFile("src/App.tsx")));
        GetObjectResponse packageJson = streamOf("{\"scripts\":{\"dev\":\"vite\",\"dev:all\":\"x\",\"start\":\"tsx server/index.ts\"}}");
        GetObjectResponse server = streamOf("export {};");
        GetObjectResponse page = streamOf("export default 1;");
        when(minioClient.getObject(argThatMatchesObject("package.json"))).thenReturn(packageJson);
        GetObjectResponse launcher = streamOf("export {};");
        when(minioClient.getObject(argThatMatchesObject("start.mjs"))).thenReturn(launcher);
        when(minioClient.getObject(argThatMatchesObject("server/index.ts"))).thenReturn(server);
        when(minioClient.getObject(argThatMatchesObject("src/App.tsx"))).thenReturn(page);

        java.util.Map<String, String> entries = entriesOf(service.buildProjectZip(PROJECT_ID).bytes());

        assertThat(entries.keySet()).containsExactly("package.json", "start.mjs", "server/index.ts", "src/App.tsx", "README.md", ".gitignore");
        assertThat(entries.get("package.json")).contains("\"dev:all\"");
        assertThat(entries.get("README.md")).startsWith("# Noughts\n").contains("npm run dev:all").contains("Start command: `npm start`");
        assertThat(entries.get(".gitignore")).contains("node_modules").contains(".data").contains(".env");
    }

    @Test
    void aProjectsOwnReadmeAndGitignoreAreNeverReplaced() throws Exception {
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(projectFile("README.md"), projectFile(".gitignore")));
        GetObjectResponse readme = streamOf("mine");
        GetObjectResponse ignore = streamOf("dist");
        when(minioClient.getObject(argThatMatchesObject("README.md"))).thenReturn(readme);
        when(minioClient.getObject(argThatMatchesObject(".gitignore"))).thenReturn(ignore);

        java.util.Map<String, String> entries = entriesOf(service.buildProjectZip(PROJECT_ID).bytes());

        assertThat(entries.keySet()).containsExactlyInAnyOrder("README.md", ".gitignore");
        assertThat(entries.get("README.md")).doesNotContain("Built with Singularity");
        assertThat(entries.get(".gitignore")).doesNotContain("node_modules");
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
