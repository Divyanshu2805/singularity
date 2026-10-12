package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.GitHubProperties;
import com.singularity.workspace.dto.github.GitHubPushRequest;
import com.singularity.workspace.dto.github.GitHubStatusResponse;
import com.singularity.workspace.dto.github.ProjectGitHubResponse;
import com.singularity.workspace.entity.GitHubConnection;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectGitHubRepo;
import com.singularity.workspace.repository.GitHubConnectionRepository;
import com.singularity.workspace.repository.ProjectGitHubRepoRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.impl.GitHubClient.GitHubException;
import com.singularity.workspace.service.impl.GitHubClient.TreeEntry;
import com.singularity.workspace.util.GitHubTokenCipher;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Tests for {@link GitHubServiceImpl}: connecting a person to GitHub and pushing a project to a repository of theirs.
 *
 * <p>Handles: a sign-in whose state is not this person's being refused before GitHub is asked anything, and a good one
 * storing the token encrypted and never returning it; disconnecting deleting the token even when GitHub cannot be
 * told; a first push making a private repository, saving the link before any file is sent, and committing the
 * project's files with a README and a .gitignore added and environment files and workflows left out and named; a
 * later push finding the repository by its id, using its new name and saying "update"; a binary or large file being
 * uploaded by itself; a repository that is gone ending the link, a token GitHub no longer takes ending the
 * connection, a name already taken being said in words, a repository with no first commit yet being waited for; the
 * hourly limit; and every answer saying the feature is unavailable when it is switched off.
 *
 * <p>GitHub is a mock here. The shapes of the real requests are pinned in {@link GitHubClientTest}, and that the real
 * GitHub accepts them is checked by hand with a registered app.
 */
class GitHubServiceImplTest {

    private static final long USER_ID = 7L;
    private static final long PROJECT_ID = 42L;
    private static final long REVISION = 12L;
    private static final String TOKEN = "gho_secret";
    private static final Instant NOW = Instant.parse("2026-10-10T10:00:00Z");
    private static final GitHubClient.Repo REPO =
            new GitHubClient.Repo(99L, "asha/noughts", "https://github.com/asha/noughts", "main", true);

    private final GitHubConnectionRepository connections = mock(GitHubConnectionRepository.class);
    private final ProjectGitHubRepoRepository repos = mock(ProjectGitHubRepoRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final PublishSourceReader sourceReader = mock(PublishSourceReader.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final GitHubClient client = mock(GitHubClient.class);
    private final GitHubTokenCipher cipher = new GitHubTokenCipher(Base64.getEncoder().encodeToString(new byte[32]));
    private final GitHubProperties properties = properties(20);
    private final Clock clock = Clock.fixed(NOW, ZoneOffset.UTC);
    private final Map<String, byte[]> files = new LinkedHashMap<>();

    private GitHubServiceImpl service;

    private static GitHubProperties properties(int pushesPerHour) {
        return properties(pushesPerHour, 100_000);
    }

    private static GitHubProperties properties(int pushesPerHour, int inlineFileBytes) {
        return new GitHubProperties("client-1", "secret-1", Base64.getEncoder().encodeToString(new byte[32]),
                null, null, "https://app.example.dev/github/callback", null, null, null, pushesPerHour, inlineFileBytes, 1_000_000);
    }

    private GitHubServiceImpl serviceWith(GitHubProperties settings) {
        GitHubServiceImpl made = new GitHubServiceImpl(connections, repos, projectRepository, sourceReader, authUtil,
                client, cipher, settings, clock);
        made.headPause = Duration.ZERO;
        return made;
    }

    @BeforeEach
    void aSignedInOwnerOfAProject() {
        service = serviceWith(properties);
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).name("Noughts").build()));
        when(projectRepository.findCurrentFileRevisionId(PROJECT_ID)).thenReturn(Optional.of(REVISION));
        when(repos.save(any())).thenAnswer(call -> call.getArgument(0));
        files.put("package.json", "{\"scripts\":{\"dev\":\"vite\"}}".getBytes(StandardCharsets.UTF_8));
        files.put("src/App.tsx", "export default 1;\n".getBytes(StandardCharsets.UTF_8));
        when(sourceReader.capture(PROJECT_ID)).thenAnswer(call -> new PublishSourceReader.Captured(REVISION, files, 100));
    }

    private void connected() {
        when(connections.findById(USER_ID)).thenReturn(Optional.of(GitHubConnection.builder()
                .userId(USER_ID).githubUserId(4242L).login("asha").accessTokenCipher(cipher.encrypt(TOKEN)).connectedAt(NOW).build()));
    }

    private ProjectGitHubRepo linked() {
        ProjectGitHubRepo link = ProjectGitHubRepo.builder().projectId(PROJECT_ID).pushedBy(USER_ID).repoId(99L)
                .fullName("asha/noughts").htmlUrl("https://github.com/asha/noughts").defaultBranch("main").privateRepo(true)
                .lastCommitSha("commit-0").lastPushedRevisionId(REVISION - 1).lastPushedAt(NOW.minusSeconds(60)).createdAt(NOW).build();
        when(repos.findById(PROJECT_ID)).thenReturn(Optional.of(link));
        return link;
    }

    private void gitHubTakesACommit() {
        when(client.headSha(TOKEN, "asha/noughts", "main")).thenReturn("head-1");
        when(client.createTree(eq(TOKEN), eq("asha/noughts"), any())).thenReturn("tree-1");
        when(client.createCommit(eq(TOKEN), eq("asha/noughts"), anyString(), eq("tree-1"), eq("head-1"))).thenReturn("commit-1");
    }

    @SuppressWarnings("unchecked")
    private List<TreeEntry> theTree() {
        ArgumentCaptor<List<TreeEntry>> tree = ArgumentCaptor.forClass(List.class);
        verify(client).createTree(eq(TOKEN), eq("asha/noughts"), tree.capture());
        return tree.getValue();
    }

    @Test
    void aSignInIsStartedWithAStateOnlyThisPersonCanFinish() {
        when(client.authorizeUrl(anyString())).thenAnswer(call -> "https://github.com/login/oauth/authorize?state=" + call.getArgument(0));

        String url = service.startConnect().url();

        String state = url.substring(url.indexOf("state=") + 6);
        assertThat(cipher.isStateFor(state, USER_ID, NOW)).isTrue();
        assertThat(cipher.isStateFor(state, USER_ID + 1, NOW)).isFalse();
    }

    @Test
    void aSignInWhoseStateIsNotThisPersonsIsRefusedBeforeGitHubIsAskedAnything() {
        String someoneElses = cipher.newState(USER_ID + 1, NOW, Duration.ofMinutes(10));
        String runOut = cipher.newState(USER_ID, NOW.minusSeconds(3600), Duration.ofMinutes(10));

        assertThatThrownBy(() -> service.completeConnect("code", someoneElses)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.completeConnect("code", runOut)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.completeConnect("code", "made-up")).isInstanceOf(BadRequestException.class);
        verifyNoInteractions(client);
        verify(connections, never()).save(any());
    }

    @Test
    void aFinishedSignInStoresTheTokenEncryptedAndNeverReturnsIt() {
        when(client.exchange("code-9")).thenReturn(new GitHubClient.Grant(TOKEN, "repo"));
        when(client.account(TOKEN)).thenReturn(new GitHubClient.Account(4242L, "asha"));

        GitHubStatusResponse answer = service.completeConnect("code-9", cipher.newState(USER_ID, NOW, Duration.ofMinutes(10)));

        ArgumentCaptor<GitHubConnection> saved = ArgumentCaptor.forClass(GitHubConnection.class);
        verify(connections).save(saved.capture());
        assertThat(saved.getValue().getUserId()).isEqualTo(USER_ID);
        assertThat(saved.getValue().getLogin()).isEqualTo("asha");
        assertThat(saved.getValue().getAccessTokenCipher()).doesNotContain(TOKEN);
        assertThat(cipher.decrypt(saved.getValue().getAccessTokenCipher())).isEqualTo(TOKEN);
        assertThat(answer).isEqualTo(new GitHubStatusResponse(true, true, "asha"));
        assertThat(answer.toString()).doesNotContain(TOKEN);
    }

    @Test
    void aCodeGitHubRefusesIsABadRequestAndAnOutageIsAnOutage() {
        String state = cipher.newState(USER_ID, NOW, Duration.ofMinutes(10));
        when(client.exchange("old")).thenThrow(new GitHubException(400, "The code passed is incorrect or expired."));
        when(client.exchange("down")).thenThrow(new GitHubException(0, "GitHub could not be reached"));

        assertThatThrownBy(() -> service.completeConnect("old", state)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.completeConnect("down", state)).isInstanceOf(ExternalServiceException.class);
        verify(connections, never()).save(any());
    }

    @Test
    void disconnectingDeletesTheTokenEvenWhenGitHubCannotBeTold() {
        connected();
        doThrow(new GitHubException(0, "GitHub could not be reached")).when(client).forget(TOKEN);

        service.disconnect();

        verify(client).forget(TOKEN);
        verify(connections).delete(any(GitHubConnection.class));
    }

    @Test
    void aFirstPushMakesAPrivateRepositorySavesTheLinkFirstAndCommitsTheProjectsFiles() {
        connected();
        when(repos.findById(PROJECT_ID)).thenReturn(Optional.empty());
        when(client.createRepository(TOKEN, "noughts", true, "Built with Singularity")).thenReturn(REPO);
        gitHubTakesACommit();

        service.push(PROJECT_ID, null);

        InOrder order = inOrder(client, repos);
        order.verify(client).createRepository(TOKEN, "noughts", true, "Built with Singularity");
        order.verify(repos).save(any(ProjectGitHubRepo.class));
        order.verify(client).headSha(TOKEN, "asha/noughts", "main");
        order.verify(client).createTree(eq(TOKEN), eq("asha/noughts"), any());
        order.verify(client).createCommit(TOKEN, "asha/noughts", "Add the app from Singularity", "tree-1", "head-1");
        order.verify(client).moveBranch(TOKEN, "asha/noughts", "main", "commit-1");
        order.verify(repos).save(any(ProjectGitHubRepo.class));

        assertThat(theTree()).extracting(TreeEntry::path).containsExactly("package.json", "src/App.tsx", "README.md", ".gitignore");
        assertThat(theTree()).allSatisfy(entry -> assertThat(entry.blobSha()).isNull());
        assertThat(theTree().get(2).content()).startsWith("# Noughts\n");
        ArgumentCaptor<ProjectGitHubRepo> saved = ArgumentCaptor.forClass(ProjectGitHubRepo.class);
        verify(repos, times(2)).save(saved.capture());
        assertThat(saved.getValue().getLastCommitSha()).isEqualTo("commit-1");
        assertThat(saved.getValue().getLastPushedRevisionId()).isEqualTo(REVISION);
        assertThat(saved.getValue().getLastPushedAt()).isEqualTo(NOW);
        assertThat(saved.getValue().getRepoId()).isEqualTo(99L);
    }

    @Test
    void theNameAndVisibilityAskedForAreUsedAndABadNameIsRefusedBeforeGitHubIsAsked() {
        connected();
        when(repos.findById(PROJECT_ID)).thenReturn(Optional.empty());
        when(client.createRepository(TOKEN, "my-game", false, "Built with Singularity"))
                .thenReturn(new GitHubClient.Repo(99L, "asha/noughts", "https://github.com/asha/noughts", "main", false));
        gitHubTakesACommit();

        service.push(PROJECT_ID, new GitHubPushRequest(" my-game ", false, null));
        verify(client).createRepository(TOKEN, "my-game", false, "Built with Singularity");

        assertThatThrownBy(() -> service.push(PROJECT_ID, new GitHubPushRequest("my game", true, null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("letters, digits");
        verify(client, times(1)).createRepository(anyString(), anyString(), anyBoolean(), anyString());
    }

    @Test
    void environmentFilesAndWorkflowsAreLeftOutAndNamed() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        gitHubTakesACommit();
        files.put(".env", "KEY=1".getBytes(StandardCharsets.UTF_8));
        files.put("server/.env.local", "KEY=2".getBytes(StandardCharsets.UTF_8));
        files.put(".env.example", "KEY=".getBytes(StandardCharsets.UTF_8));
        files.put(".github/workflows/ci.yml", "on: push".getBytes(StandardCharsets.UTF_8));

        ProjectGitHubResponse answer = service.push(PROJECT_ID, null);

        assertThat(answer.leftOut()).containsExactly(".env", "server/.env.local", ".github/workflows/ci.yml");
        assertThat(theTree()).extracting(TreeEntry::path)
                .contains(".env.example").doesNotContain(".env", "server/.env.local", ".github/workflows/ci.yml");
    }

    @Test
    void aLaterPushSaysWhatChangedInOneShortLine() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        gitHubTakesACommit();

        service.push(PROJECT_ID, new GitHubPushRequest(null, null, "  Add a dark theme toggle\tin the header\nand remember my choice  "));

        verify(client).createCommit(eq(TOKEN), anyString(), eq("Add a dark theme toggle in the header"), anyString(), anyString());
    }

    @Test
    void aCommitMessageIsCutToOneLineOfSeventyTwoCharactersAndFallsBackWhenThereIsNone() {
        String longLine = "Let people sort the list by date, by name and by how often they have opened each entry so far";

        assertThat(GitHubServiceImpl.messageFor(new GitHubPushRequest(null, null, longLine)))
                .hasSizeBetween(69, 72).endsWith("...").doesNotContain(" ...").startsWith("Let people sort the list by date");
        assertThat(GitHubServiceImpl.messageFor(new GitHubPushRequest(null, null, "\n\n  Fix the title\u0007\n")))
                .isEqualTo("Fix the title");
        assertThat(GitHubServiceImpl.messageFor(new GitHubPushRequest(null, null, " \n\t "))).isEqualTo("Update from Singularity");
        assertThat(GitHubServiceImpl.messageFor(new GitHubPushRequest("name", true, null))).isEqualTo("Update from Singularity");
        assertThat(GitHubServiceImpl.messageFor(null)).isEqualTo("Update from Singularity");
    }

    @Test
    void aLaterPushFindsTheRepositoryByItsIdUsesItsNewNameAndSaysUpdate() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(new GitHubClient.Repo(99L, "asha/renamed", "https://github.com/asha/renamed", "trunk", false));
        when(client.headSha(TOKEN, "asha/renamed", "trunk")).thenReturn("head-2");
        when(client.createTree(eq(TOKEN), eq("asha/renamed"), any())).thenReturn("tree-2");
        when(client.createCommit(TOKEN, "asha/renamed", "Update from Singularity", "tree-2", "head-2")).thenReturn("commit-2");

        ProjectGitHubResponse answer = service.push(PROJECT_ID, new GitHubPushRequest("ignored", true, null));

        verify(client, never()).createRepository(anyString(), anyString(), anyBoolean(), anyString());
        verify(client).moveBranch(TOKEN, "asha/renamed", "trunk", "commit-2");
        assertThat(answer.fullName()).isEqualTo("asha/renamed");
        assertThat(answer.url()).isEqualTo("https://github.com/asha/renamed");
        assertThat(answer.privateRepo()).isFalse();
        assertThat(answer.hasChanges()).isFalse();
        assertThat(answer.lastPushedAt()).isEqualTo(NOW);
    }

    @Test
    void aBinaryFileAndOnePastTheSizeLimitAreUploadedByThemselves() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        gitHubTakesACommit();
        byte[] image = {(byte) 0x89, 'P', 'N', 'G', 0, 1};
        byte[] long1 = "x".repeat(150).getBytes(StandardCharsets.UTF_8);
        files.put("public/logo.png", image);
        files.put("src/long.ts", long1);
        when(client.createBlob(TOKEN, "asha/noughts", image)).thenReturn("blob-image");
        when(client.createBlob(TOKEN, "asha/noughts", long1)).thenReturn("blob-long");

        serviceWith(properties(20, 100)).push(PROJECT_ID, null);

        Map<String, String> blobs = new LinkedHashMap<>();
        theTree().forEach(entry -> blobs.put(entry.path(), entry.blobSha()));
        assertThat(blobs).containsEntry("public/logo.png", "blob-image").containsEntry("src/long.ts", "blob-long")
                .containsEntry("src/App.tsx", null);
    }

    @Test
    void aRepositoryThatIsGoneEndsTheLinkAndSaysSo() {
        connected();
        ProjectGitHubRepo link = linked();
        when(client.repository(TOKEN, 99L)).thenThrow(new GitHubException(404, "Not Found"));

        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class)
                .hasMessageContaining("asha/noughts is no longer on GitHub");
        verify(repos).delete(link);
        verify(client, never()).createTree(anyString(), anyString(), any());
    }

    @Test
    void aTokenGitHubNoLongerTakesEndsTheConnection() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenThrow(new GitHubException(401, "Bad credentials"));

        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class)
                .hasMessageContaining("Connect your GitHub account again").hasMessageNotContaining(TOKEN);
        verify(connections).delete(any(GitHubConnection.class));
    }

    @Test
    void aNameAlreadyTakenIsSaidInWordsAndNoLinkIsSaved() {
        connected();
        when(repos.findById(PROJECT_ID)).thenReturn(Optional.empty());
        when(client.createRepository(anyString(), anyString(), anyBoolean(), anyString()))
                .thenThrow(new GitHubException(422, "Repository creation failed. - name already exists on this account"));

        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class)
                .hasMessageContaining("\"noughts\"").hasMessageContaining("name already exists").hasMessageContaining("choose another");
        verify(repos, never()).save(any());
    }

    @Test
    void aRepositoryWithNoFirstCommitYetIsWaitedForAndThenGivenUpOn() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        when(client.headSha(TOKEN, "asha/noughts", "main"))
                .thenThrow(new GitHubException(409, "Git Repository is empty."))
                .thenThrow(new GitHubException(404, "Not Found"))
                .thenReturn("head-1");
        when(client.createTree(eq(TOKEN), eq("asha/noughts"), any())).thenReturn("tree-1");
        when(client.createCommit(eq(TOKEN), eq("asha/noughts"), anyString(), eq("tree-1"), eq("head-1"))).thenReturn("commit-1");

        service.push(PROJECT_ID, null);
        verify(client, times(3)).headSha(TOKEN, "asha/noughts", "main");

        when(client.headSha(TOKEN, "asha/noughts", "main")).thenThrow(new GitHubException(409, "Git Repository is empty."));
        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class).hasMessageContaining("Push again");
    }

    @Test
    void aPushThatFailsLeavesTheProjectFreeToBePushedAgain() {
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        when(client.headSha(TOKEN, "asha/noughts", "main")).thenThrow(new GitHubException(500, "boom")).thenReturn("head-1");
        when(client.createTree(eq(TOKEN), eq("asha/noughts"), any())).thenReturn("tree-1");
        when(client.createCommit(eq(TOKEN), eq("asha/noughts"), anyString(), eq("tree-1"), eq("head-1"))).thenReturn("commit-1");

        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ExternalServiceException.class);

        assertThat(service.push(PROJECT_ID, null).linked()).isTrue();
    }

    @Test
    void pushingNeedsAConnectionAndIsLimitedPerHour() {
        when(connections.findById(USER_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class)
                .hasMessage("Connect your GitHub account first.");

        GitHubServiceImpl limited = serviceWith(properties(1));
        connected();
        linked();
        when(client.repository(TOKEN, 99L)).thenReturn(REPO);
        gitHubTakesACommit();

        limited.push(PROJECT_ID, null);
        assertThatThrownBy(() -> limited.push(PROJECT_ID, null)).isInstanceOf(RateLimitExceededException.class);
    }

    @Test
    void aProjectsStandingSaysWhetherItHasChangedSinceItWasPushedAndOffersAName() {
        connected();
        when(repos.findById(PROJECT_ID)).thenReturn(Optional.empty());

        ProjectGitHubResponse never = service.projectStatus(PROJECT_ID);
        assertThat(never.available()).isTrue();
        assertThat(never.connected()).isTrue();
        assertThat(never.login()).isEqualTo("asha");
        assertThat(never.linked()).isFalse();
        assertThat(never.suggestedName()).isEqualTo("noughts");
        assertThat(never.hasChanges()).isFalse();

        ProjectGitHubRepo link = linked();
        assertThat(service.projectStatus(PROJECT_ID).hasChanges()).isTrue();
        link.setLastPushedRevisionId(REVISION);
        ProjectGitHubResponse level = service.projectStatus(PROJECT_ID);
        assertThat(level.hasChanges()).isFalse();
        assertThat(level.suggestedName()).isNull();
        assertThat(level.url()).isEqualTo("https://github.com/asha/noughts");
    }

    @Test
    void unlinkingForgetsTheLinkAndCallsNothingOnGitHub() {
        ProjectGitHubRepo link = linked();

        service.unlink(PROJECT_ID);

        verify(repos).delete(link);
        verifyNoInteractions(client);
    }

    @Test
    void switchedOffEveryAnswerSaysUnavailableAndDisconnectingStillDeletesAStoredToken() {
        GitHubServiceImpl off = new GitHubServiceImpl(connections, repos, projectRepository, sourceReader, authUtil,
                null, null, null, clock);
        connected();

        assertThat(off.status().available()).isFalse();
        assertThat(off.projectStatus(PROJECT_ID).available()).isFalse();
        assertThatThrownBy(off::startConnect).isInstanceOf(ConflictException.class).hasMessageContaining("not set up");
        assertThatThrownBy(() -> off.completeConnect("c", "s")).isInstanceOf(ConflictException.class);
        assertThatThrownBy(() -> off.push(PROJECT_ID, null)).isInstanceOf(ConflictException.class);
        off.disconnect();
        verify(connections).delete(any(GitHubConnection.class));
        verify(client, never()).forget(anyString());
        verify(sourceReader, never()).capture(anyLong());
    }

    @Test
    void textIsToldFromBytesThatAreNot() {
        assertThat(GitHubServiceImpl.textOf("café ✓".getBytes(StandardCharsets.UTF_8))).isEqualTo("café ✓");
        assertThat(GitHubServiceImpl.textOf(new byte[0])).isEmpty();
        assertThat(GitHubServiceImpl.textOf(new byte[]{'a', 0, 'b'})).isNull();
        assertThat(GitHubServiceImpl.textOf(new byte[]{(byte) 0xff, (byte) 0xfe})).isNull();
    }
}
