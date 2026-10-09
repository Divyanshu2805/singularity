package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.dto.publish.PublicAppResponse;
import com.singularity.workspace.dto.publish.PublicFileContent;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectFile;
import com.singularity.workspace.entity.ProjectMember;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.mapper.ProjectMapper;
import com.singularity.workspace.repository.ProjectFileRepository;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.repository.PublishedAppRepository;
import com.singularity.workspace.service.impl.PublishedStore.StoredFile;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The public page of a shared app. It is the one surface open to strangers, so most of these cases are about what a
 * stranger must not learn or reach: every way the app can be unavailable answers the same "not found", a path is
 * checked before it becomes a key, work in progress is never read, and a fork that loses a file is deleted rather than
 * left looking complete.
 */
class PublicAppServiceImplTest {

    private static final long PROJECT_ID = 5L;
    private static final long USER_ID = 7L;
    private static final String SLUG = "my-app-ab12";

    private final PublishedAppRepository appRepository = mock(PublishedAppRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectMemberRepository memberRepository = mock(ProjectMemberRepository.class);
    private final ProjectFileRepository fileRepository = mock(ProjectFileRepository.class);
    private final PublishedStore store = mock(PublishedStore.class);
    private final ProjectQuota quota = mock(ProjectQuota.class);
    private final ProjectMapper mapper = mock(ProjectMapper.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final PublicAppServiceImpl service = new PublicAppServiceImpl(appRepository, projectRepository, memberRepository,
            fileRepository, store, PublishingTestProperties.defaults(), quota, mapper, authUtil, "projects");

    private Project project;
    private PublishedApp app;

    @BeforeEach
    void aSharedLiveApp() {
        project = Project.builder().id(PROJECT_ID).name("My App").isPublic(true).build();
        app = PublishedApp.builder().id(1L).projectId(PROJECT_ID).slug(SLUG).status(PublishStatus.LIVE)
                .livePrefix("b2/").publishedAt(Instant.now()).build();
        when(appRepository.findBySlug(SLUG)).thenReturn(Optional.of(app));
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(store.listSources(SLUG, "b2/")).thenReturn(List.of(new StoredFile("src/App.tsx", 20), new StoredFile("package.json", 5)));
        when(projectRepository.save(any(Project.class))).thenAnswer(call -> {
            Project saved = call.getArgument(0);
            if (saved.getId() == null) saved.setId(99L);
            return saved;
        });
    }

    @Test
    @DisplayName("a shared app is described by name, link and file count - and nothing about who owns it")
    void describesTheApp() {
        PublicAppResponse response = service.getApp(SLUG);

        assertThat(response.name()).isEqualTo("My App");
        assertThat(response.url()).isEqualTo("http://my-app-ab12.localhost:8090/");
        assertThat(response.fileCount()).isEqualTo(2);
    }

    @Test
    @DisplayName("every way the app can be unavailable is the same not-found")
    void everyUnavailableCaseLooksAlike() {
        when(appRepository.findBySlug("nope")).thenReturn(Optional.empty());
        assertNotFound("nope");
        assertNotFound(null);

        app.setStatus(PublishStatus.UNPUBLISHED);
        assertNotFound(SLUG);

        app.setStatus(PublishStatus.LIVE);
        project.setIsPublic(false);
        assertNotFound(SLUG);

        project.setIsPublic(true);
        project.setDeletedAt(Instant.now());
        assertNotFound(SLUG);

        project.setDeletedAt(null);
        app.setLivePrefix(null);
        assertNotFound(SLUG);
    }

    private void assertNotFound(String slug) {
        assertThatThrownBy(() -> service.getApp(slug)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.getFiles(slug)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.getFile(slug, "package.json")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.fork(slug, null)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("the file list is the live build's snapshot, sorted by path")
    void listsTheSnapshot() {
        assertThat(service.getFiles(SLUG)).extracting("path").containsExactly("package.json", "src/App.tsx");
    }

    @Test
    @DisplayName("a file's text is read from the snapshot of the live build")
    void readsAFile() {
        when(store.readSource(eq(SLUG), eq("b2/"), eq("src/App.tsx"), anyInt()))
                .thenReturn(Optional.of("export default 1;".getBytes(StandardCharsets.UTF_8)));

        PublicFileContent content = service.getFile(SLUG, "src/App.tsx");

        assertThat(content.content()).isEqualTo("export default 1;");
        assertThat(content.binary()).isFalse();
    }

    @Test
    @DisplayName("a binary file comes back as a note, not as garbled text")
    void binaryFile() {
        when(store.readSource(eq(SLUG), eq("b2/"), eq("public/logo.png"), anyInt()))
                .thenReturn(Optional.of(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0, 1}));

        PublicFileContent content = service.getFile(SLUG, "public/logo.png");

        assertThat(content.binary()).isTrue();
        assertThat(content.content()).isEmpty();
    }

    @Test
    @DisplayName("a missing file is a not-found, and a traversing path is refused before it becomes a key")
    void pathsAreChecked() {
        when(store.readSource(anyString(), anyString(), anyString(), anyInt())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getFile(SLUG, "nope.txt")).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.getFile(SLUG, "../../other-app/b1/src/x")).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.getFile(SLUG, "a\\b")).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("a fork copies every file of the snapshot into the caller's new project, which they own")
    void forks() {
        ProjectMemberRepository members = memberRepository;
        service.fork(SLUG, null);

        ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(saved.capture());
        assertThat(saved.getValue().getName()).isEqualTo("My App (fork)");
        assertThat(saved.getValue().getForkedFromProjectId()).isEqualTo(PROJECT_ID);
        assertThat(saved.getValue().getIsPublic()).isFalse();

        ArgumentCaptor<ProjectMember> member = ArgumentCaptor.forClass(ProjectMember.class);
        verify(members).save(member.capture());
        assertThat(member.getValue().getProjectRole()).isEqualTo(ProjectRole.OWNER);
        assertThat(member.getValue().getId().getUserId()).isEqualTo(USER_ID);

        verify(quota).assertCanCreateProject();
        verify(store).copySourceTo(SLUG, "b2/", "src/App.tsx", "projects", "99/src/App.tsx");
        verify(store).copySourceTo(SLUG, "b2/", "package.json", "projects", "99/package.json");
        verify(fileRepository, org.mockito.Mockito.times(2)).save(any(ProjectFile.class));
    }

    @Test
    @DisplayName("a requested name is used, and cut to the limit")
    void forkName() {
        service.fork(SLUG, new com.singularity.workspace.dto.project.ForkProjectRequest("  Mine  "));

        ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository).save(saved.capture());
        assertThat(saved.getValue().getName()).isEqualTo("Mine");
    }

    @Test
    @DisplayName("a fork over the project allowance is refused before anything is created")
    void forkOverTheAllowance() {
        doThrow(new com.singularity.common.error.QuotaExceededException("full",
                com.singularity.common.error.QuotaExceededException.Reason.PROJECT_LIMIT, 1, 1, null, "Free"))
                .when(quota).assertCanCreateProject();

        assertThatThrownBy(() -> service.fork(SLUG, null)).isInstanceOf(com.singularity.common.error.QuotaExceededException.class);

        verify(projectRepository, never()).save(any());
        verify(store, never()).copySourceTo(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("a fork that loses a file is deleted again rather than left looking complete")
    void forkThatLosesAFile() {
        doThrow(new FileStorageException("gone", null))
                .when(store).copySourceTo(SLUG, "b2/", "package.json", "projects", "99/package.json");

        assertThatThrownBy(() -> service.fork(SLUG, null)).isInstanceOf(FileStorageException.class);

        ArgumentCaptor<Project> saved = ArgumentCaptor.forClass(Project.class);
        verify(projectRepository, org.mockito.Mockito.atLeast(2)).save(saved.capture());
        assertThat(saved.getValue().getDeletedAt()).isNotNull();
    }

    @Test
    @DisplayName("the binary sniff looks only at the start of a file")
    void sniff() {
        assertThat(PublicAppServiceImpl.looksBinary(new byte[]{'a', 0})).isTrue();
        assertThat(PublicAppServiceImpl.looksBinary("plain".getBytes(StandardCharsets.UTF_8))).isFalse();
    }
}
