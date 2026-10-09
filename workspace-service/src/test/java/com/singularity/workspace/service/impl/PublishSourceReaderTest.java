package com.singularity.workspace.service.impl;

import com.singularity.common.error.ConflictException;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.impl.PublishSourceReader.Captured;
import com.singularity.workspace.util.TarArchive.TooLargeException;
import io.minio.GetObjectArgs;
import io.minio.GetObjectResponse;
import io.minio.MinioClient;
import okhttp3.Headers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Reading a project's files for a build, and the environment-file rule for the share page.
 *
 * <p>The read is the revision's only if the revision did not move while it ran, so the cases here are the race (a
 * second read, and finally an error rather than a blend of two revisions), the files a build never wants, the limits,
 * and that a {@code .env} never reaches the sources stored for the share page.
 */
class PublishSourceReaderTest {

    private static final long PROJECT_ID = 5L;

    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectFileRepository projectFileRepository = mock(ProjectFileRepository.class);
    private final MinioClient minio = mock(MinioClient.class);

    private PublishSourceReader reader(int maxFiles, long maxBytes) {
        var base = PublishingTestProperties.defaults();
        var properties = new com.singularity.workspace.config.PublishingProperties(base.publicScheme(), base.publicDomain(),
                base.publicPort(), base.bucket(), base.planLimits(), base.defaultLimit(), base.maxBuildsPerHour(),
                base.minBuildInterval(), base.runnerWait(), base.installTimeout(), base.buildTimeout(), base.collectTimeout(),
                maxFiles, maxBytes, base.maxOutputFiles(), base.maxOutputBytes(), base.retireAfter(),
                base.heartbeatStaleAfter(), base.logMaxChars());
        return new PublishSourceReader(projectRepository, projectFileRepository, minio, properties, "projects");
    }

    private static ProjectFile file(String path) {
        return ProjectFile.builder().path(path).size(10L).build();
    }

    private void objects(Map<String, String> contentByPath) throws Exception {
        for (Map.Entry<String, String> entry : contentByPath.entrySet()) {
            String key = PROJECT_ID + "/" + entry.getKey();
            when(minio.getObject(org.mockito.ArgumentMatchers.argThat((GetObjectArgs args) -> args != null && key.equals(args.object()))))
                    .thenAnswer(call -> new GetObjectResponse(Headers.of(), "projects", "", key,
                            new ByteArrayInputStream(entry.getValue().getBytes(StandardCharsets.UTF_8))));
        }
    }

    @Test
    @DisplayName("every file is read, and the revision it stood at is reported")
    void readsEveryFile() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(3L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("package.json"), file("src/App.tsx")));
        objects(Map.of("package.json", "{}", "src/App.tsx", "export default 1;"));

        Captured captured = reader(500, 1_000_000).capture(PROJECT_ID);

        assertThat(captured.revisionId()).isEqualTo(3L);
        assertThat(captured.files().keySet()).containsExactlyInAnyOrder("package.json", "src/App.tsx");
        assertThat(new String(captured.files().get("src/App.tsx"), StandardCharsets.UTF_8)).isEqualTo("export default 1;");
        assertThat(captured.totalBytes()).isEqualTo(2 + 17);
    }

    @Test
    @DisplayName("a project with no revision yet is read at revision null")
    void noRevision() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.empty());
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("package.json")));
        objects(Map.of("package.json", "{}"));

        assertThat(reader(500, 1_000_000).capture(PROJECT_ID).revisionId()).isNull();
    }

    @Test
    @DisplayName("a revision that moves while the files are read is read again, not blended")
    void readsAgainWhenTheRevisionMoves() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID))
                .thenReturn(Optional.of(3L), Optional.of(4L), Optional.of(4L), Optional.of(4L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("package.json")));
        objects(Map.of("package.json", "{}"));

        Captured captured = reader(500, 1_000_000).capture(PROJECT_ID);

        assertThat(captured.revisionId()).isEqualTo(4L);
        verify(projectFileRepository, times(2)).findByProjectId(PROJECT_ID);
    }

    @Test
    @DisplayName("a project that never holds still is an error after three tries, not a guess")
    void givesUpWhenItNeverHoldsStill() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenAnswer(new org.mockito.stubbing.Answer<Optional<Long>>() {
            private long next = 1;

            @Override
            public Optional<Long> answer(org.mockito.invocation.InvocationOnMock call) {
                return Optional.of(next++);
            }
        });
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("package.json")));
        objects(Map.of("package.json", "{}"));

        assertThatThrownBy(() -> reader(500, 1_000_000).capture(PROJECT_ID)).isInstanceOf(ConflictException.class);
        verify(projectFileRepository, times(3)).findByProjectId(PROJECT_ID);
    }

    @Test
    @DisplayName("node_modules, .git and a previous dist are left out of the build")
    void leavesOutWhatABuildNeverWants() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(3L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(
                file("package.json"), file("node_modules/react/index.js"), file(".git/HEAD"), file("dist/index.html")));
        objects(Map.of("package.json", "{}"));

        assertThat(reader(500, 1_000_000).capture(PROJECT_ID).files().keySet()).containsExactly("package.json");
    }

    @Test
    @DisplayName("more files than the limit is refused with a sentence, before any of them is read")
    void tooManyFiles() {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(3L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("a"), file("b"), file("c")));

        assertThatThrownBy(() -> reader(2, 1_000_000).capture(PROJECT_ID))
                .isInstanceOf(TooLargeException.class).hasMessageContaining("more than 2 files");
    }

    @Test
    @DisplayName("files that add up to more than the limit are refused")
    void tooManyBytes() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(3L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("a.txt"), file("b.txt")));
        objects(Map.of("a.txt", "x".repeat(600), "b.txt", "x".repeat(600)));

        assertThatThrownBy(() -> reader(500, 1000).capture(PROJECT_ID)).isInstanceOf(TooLargeException.class);
    }

    @Test
    @DisplayName("environment files are dropped from what is shared, and their example files are kept")
    void environmentFilesAreNotShared() {
        Map<String, byte[]> files = new LinkedHashMap<>();
        for (String path : List.of(".env", ".env.local", ".env.production", "app/.env", ".env.example", ".env.sample",
                "src/App.tsx", "environment.ts", "src/.envelope.ts")) {
            files.put(path, new byte[]{1});
        }

        assertThat(PublishSourceReader.forSharing(files).keySet())
                .containsExactly(".env.example", ".env.sample", "src/App.tsx", "environment.ts", "src/.envelope.ts");
    }

    @Test
    @DisplayName("a file the metadata lists but storage does not have is an error, not a silently smaller build")
    void missingObject() throws Exception {
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(3L));
        when(projectFileRepository.findByProjectId(PROJECT_ID)).thenReturn(List.of(file("package.json")));
        when(minio.getObject(any(GetObjectArgs.class))).thenThrow(new java.io.IOException("NoSuchKey"));

        assertThatThrownBy(() -> reader(500, 1_000_000).capture(PROJECT_ID))
                .isInstanceOf(com.singularity.common.error.FileStorageException.class);
    }
}
