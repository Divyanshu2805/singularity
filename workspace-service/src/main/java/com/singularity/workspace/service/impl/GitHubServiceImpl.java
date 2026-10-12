package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.RateLimiter;
import com.singularity.workspace.config.GitHubProperties;
import com.singularity.workspace.dto.github.GitHubConnectResponse;
import com.singularity.workspace.dto.github.GitHubPushRequest;
import com.singularity.workspace.dto.github.GitHubStatusResponse;
import com.singularity.workspace.dto.github.ProjectGitHubResponse;
import com.singularity.workspace.entity.GitHubConnection;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectGitHubRepo;
import com.singularity.workspace.repository.GitHubConnectionRepository;
import com.singularity.workspace.repository.ProjectGitHubRepoRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.GitHubService;
import com.singularity.workspace.service.impl.GitHubClient.GitHubException;
import com.singularity.workspace.service.impl.GitHubClient.TreeEntry;
import com.singularity.workspace.util.GitHubRepoName;
import com.singularity.workspace.util.GitHubTokenCipher;
import com.singularity.workspace.util.ProjectHandout;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Connects a person to GitHub and pushes a project to a repository of theirs.
 *
 * <p>Handles: the OAuth sign-in - handing out GitHub's address with a signed state, and on the way back checking the
 * state, exchanging the code and storing the token encrypted; disconnecting, which asks GitHub to forget the grant and
 * deletes the token; a project's standing with its repository; a push, which makes the repository the first time and
 * then writes the project's files there as one commit; and forgetting the link.
 *
 * <p>Who may do what. Connecting is the caller's own business and needs only a session. A project's standing is for
 * any member. Pushing and unlinking are for whoever may publish the project - its owner - since a push sends every
 * file of the project to a place the project's other members do not control. The guards are here because every
 * caller of these methods is a user; nothing internal calls them.
 *
 * <p>The token. It is read from GitHub once, encrypted before it is stored, decrypted only inside a push or a
 * disconnect, sent to GitHub in a header, and never put in a response, a message or a log line. The scope asked for
 * is {@code repo}, which is what GitHub requires to make a private repository and is wider than this needs: it reaches
 * every repository the person has. This service touches one - the one it made for the project, found by its id - and
 * the decision record says why the narrower kind of app was not used.
 *
 * <p>What a push sends. The project's files as they stand at one revision ({@link PublishSourceReader}), without
 * environment files and without GitHub Actions workflows - the first may hold a secret, and the second GitHub refuses
 * from an app that has not asked for the right to write them. A README and a .gitignore are added when the project
 * has none ({@link ProjectHandout}). The commit's tree is exactly that set, so the repository's files become the
 * project's: a file deleted here is deleted there, and a file changed on GitHub by hand is overwritten, with the
 * earlier version still in the repository's history. What was left out is said in the answer, never dropped quietly.
 *
 * <p>What a commit says. The first is "Add the app from Singularity". Every later one says what changed, in the
 * line the browser sends with the push - the request that asked for the newest change, as History words it - cut
 * here to its first line and 72 characters with control characters removed; with no line it says "Update from
 * Singularity", which every commit said until a repository's history turned out to be a column of that sentence.
 *
 * <p>A repository made a moment ago may not have its first commit yet, so the branch's head is asked for a few times
 * before a push gives up. The link is saved as soon as the repository exists and before any file is sent: a push that
 * fails half-way must find its repository again and not try to make a second one of the same name.
 *
 * <p>GitHub's refusals are turned into sentences here. A token it no longer accepts ends the connection, so the next
 * thing the person sees is "connect again" and not the same failure twice. A repository that has gone ends the link.
 *
 * <p>One push per project at a time, and a limit on pushes per person per hour; both are held in this process, like
 * the service's other limits. The whole feature may be switched off, in which case the client and the cipher do not
 * exist, every answer says it is unavailable, and disconnecting still deletes a stored token.
 */
@Service
@Slf4j
public class GitHubServiceImpl implements GitHubService {

    static final String FIRST_MESSAGE = "Add the app from Singularity";
    static final String LATER_MESSAGE = "Update from Singularity";
    static final String DESCRIPTION = "Built with Singularity";
    static final String WORKFLOWS = ".github/workflows/";
    static final int MAX_LEFT_OUT = 20;
    static final int MESSAGE_LIMIT = 72;
    private static final int HEAD_ATTEMPTS = 6;

    private final GitHubConnectionRepository connections;
    private final ProjectGitHubRepoRepository repos;
    private final ProjectRepository projectRepository;
    private final PublishSourceReader sourceReader;
    private final AuthUtil authUtil;
    private final GitHubClient client;
    private final GitHubTokenCipher cipher;
    private final GitHubProperties properties;
    private final Clock clock;
    private final RateLimiter rateLimiter = new RateLimiter();
    private final Set<Long> pushing = ConcurrentHashMap.newKeySet();

    Duration headPause = Duration.ofMillis(700);

    @Autowired
    public GitHubServiceImpl(GitHubConnectionRepository connections, ProjectGitHubRepoRepository repos,
                             ProjectRepository projectRepository, PublishSourceReader sourceReader, AuthUtil authUtil,
                             ObjectProvider<GitHubClient> client, ObjectProvider<GitHubTokenCipher> cipher,
                             ObjectProvider<GitHubProperties> properties) {
        this(connections, repos, projectRepository, sourceReader, authUtil, client.getIfAvailable(),
                cipher.getIfAvailable(), properties.getIfAvailable(), Clock.systemUTC());
    }

    GitHubServiceImpl(GitHubConnectionRepository connections, ProjectGitHubRepoRepository repos,
                      ProjectRepository projectRepository, PublishSourceReader sourceReader, AuthUtil authUtil,
                      GitHubClient client, GitHubTokenCipher cipher, GitHubProperties properties, Clock clock) {
        this.connections = connections;
        this.repos = repos;
        this.projectRepository = projectRepository;
        this.sourceReader = sourceReader;
        this.authUtil = authUtil;
        this.client = client;
        this.cipher = cipher;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public GitHubStatusResponse status() {
        GitHubConnection connection = connections.findById(authUtil.getCurrentUserId()).orElse(null);
        return new GitHubStatusResponse(available(), connection != null, connection == null ? null : connection.getLogin());
    }

    @Override
    public GitHubConnectResponse startConnect() {
        requireAvailable();
        String state = cipher.newState(authUtil.getCurrentUserId(), clock.instant(), properties.stateTtl());
        return new GitHubConnectResponse(client.authorizeUrl(state));
    }

    @Override
    public GitHubStatusResponse completeConnect(String code, String state) {
        requireAvailable();
        Long userId = authUtil.getCurrentUserId();
        if (!cipher.isStateFor(state, userId, clock.instant())) {
            throw new BadRequestException("That GitHub sign-in has run out or was not started from this account. Start it again.");
        }
        try {
            GitHubClient.Grant grant = client.exchange(code);
            GitHubClient.Account account = client.account(grant.accessToken());
            connections.save(GitHubConnection.builder()
                    .userId(userId)
                    .githubUserId(account.id())
                    .login(account.login())
                    .accessTokenCipher(cipher.encrypt(grant.accessToken()))
                    .scopes(grant.scope())
                    .connectedAt(clock.instant())
                    .build());
            log.info("userId: {} connected the GitHub account {}", userId, account.login());
            return new GitHubStatusResponse(true, true, account.login());
        } catch (GitHubException e) {
            if (e.status() == 0 || e.status() >= 500) {
                throw new ExternalServiceException("GitHub could not be reached to finish a sign-in", e);
            }
            throw new BadRequestException("GitHub did not finish the sign-in. Start it again.");
        }
    }

    @Override
    public void disconnect() {
        Long userId = authUtil.getCurrentUserId();
        GitHubConnection connection = connections.findById(userId).orElse(null);
        if (connection == null) {
            return;
        }
        if (available()) {
            try {
                client.forget(cipher.decrypt(connection.getAccessTokenCipher()));
            } catch (RuntimeException e) {
                log.warn("GitHub was not told to forget the connection of userId: {} ({}); the stored token is deleted all the same",
                        userId, e.getClass().getSimpleName());
            }
        }
        connections.delete(connection);
        log.info("userId: {} disconnected GitHub", userId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public ProjectGitHubResponse projectStatus(Long projectId) {
        return standing(projectId, List.of());
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public ProjectGitHubResponse push(Long projectId, GitHubPushRequest request) {
        requireAvailable();
        Long userId = authUtil.getCurrentUserId();
        GitHubConnection connection = connections.findById(userId)
                .orElseThrow(() -> new ConflictException("Connect your GitHub account first."));
        long wait = rateLimiter.tryAcquire(
                new RateLimiter.Rule("github-push", properties.maxPushesPerHour(), Duration.ofHours(1)), String.valueOf(userId));
        if (wait > 0) {
            throw new RateLimitExceededException(wait);
        }
        if (!pushing.add(projectId)) {
            throw new ConflictException("This project is already being pushed. Give it a moment.");
        }
        try {
            Project project = projectRepository.findById(projectId)
                    .orElseThrow(() -> new ResourceNotFoundException("Project", String.valueOf(projectId)));
            String token = cipher.decrypt(connection.getAccessTokenCipher());
            ProjectGitHubRepo link = repos.findById(projectId).orElse(null);
            boolean first = link == null || link.getLastCommitSha() == null;
            if (link == null) {
                link = repos.save(linked(projectId, userId, create(token, project, request)));
            } else {
                refresh(token, link);
            }
            List<String> leftOut = send(token, project, link, first ? FIRST_MESSAGE : messageFor(request));
            return standing(projectId, leftOut);
        } catch (GitHubException e) {
            throw refused(e, userId);
        } finally {
            pushing.remove(projectId);
        }
    }

    @Override
    @PreAuthorize("@security.canPublishProject(#projectId)")
    public void unlink(Long projectId) {
        repos.findById(projectId).ifPresent(repos::delete);
    }

    private GitHubClient.Repo create(String token, Project project, GitHubPushRequest request) {
        String name = request == null || request.name() == null || request.name().isBlank()
                ? GitHubRepoName.suggest(project.getName()) : request.name().strip();
        String problem = GitHubRepoName.problem(name);
        if (problem != null) {
            throw new BadRequestException(problem);
        }
        boolean privateRepo = request == null || request.privateRepo() == null || request.privateRepo();
        try {
            return client.createRepository(token, name, privateRepo, DESCRIPTION);
        } catch (GitHubException e) {
            if (e.status() == 422) {
                throw new ConflictException("GitHub would not make a repository named \"" + name + "\""
                        + (e.getMessage() == null || e.getMessage().isBlank() ? "." : ": " + e.getMessage() + ".")
                        + " If you already have one by that name, choose another.");
            }
            throw e;
        }
    }

    private void refresh(String token, ProjectGitHubRepo link) {
        try {
            GitHubClient.Repo repo = client.repository(token, link.getRepoId());
            link.setFullName(repo.fullName());
            link.setHtmlUrl(repo.htmlUrl());
            link.setDefaultBranch(repo.defaultBranch());
            link.setPrivateRepo(repo.privateRepo());
        } catch (GitHubException e) {
            if (e.status() == 404) {
                String name = link.getFullName();
                repos.delete(link);
                throw new ConflictException("The repository " + name + " is no longer on GitHub, so the link to it was "
                        + "removed. Push again to make a new one.");
            }
            throw e;
        }
    }

    private List<String> send(String token, Project project, ProjectGitHubRepo link, String message) {
        PublishSourceReader.Captured captured = sourceReader.capture(project.getId());
        Map<String, byte[]> files = new LinkedHashMap<>();
        List<String> leftOut = new ArrayList<>();
        captured.files().forEach((path, bytes) -> {
            if (PublishSourceReader.isEnvironmentFile(path) || path.startsWith(WORKFLOWS)) {
                leftOut.add(path);
            } else {
                files.put(path, bytes);
            }
        });
        if (files.isEmpty()) {
            throw new BadRequestException("The project has no files to push yet.");
        }
        byte[] packageJson = files.get(ProjectHandout.PACKAGE_JSON);
        for (ProjectHandout.Extra extra : ProjectHandout.extrasFor(project.getName(), files.keySet(),
                packageJson == null ? null : new String(packageJson, StandardCharsets.UTF_8))) {
            files.put(extra.path(), extra.content().getBytes(StandardCharsets.UTF_8));
        }

        String name = link.getFullName();
        String head = head(token, name, link.getDefaultBranch());
        List<TreeEntry> entries = new ArrayList<>();
        int inline = 0;
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            byte[] bytes = file.getValue();
            String text = bytes.length <= properties.maxInlineFileBytes() && inline + bytes.length <= properties.maxInlineTotalBytes()
                    ? textOf(bytes) : null;
            if (text != null) {
                inline += bytes.length;
                entries.add(new TreeEntry(file.getKey(), text, null));
            } else {
                entries.add(new TreeEntry(file.getKey(), null, client.createBlob(token, name, bytes)));
            }
        }
        String tree = client.createTree(token, name, entries);
        String commit = client.createCommit(token, name, message, tree, head);
        client.moveBranch(token, name, link.getDefaultBranch(), commit);

        link.setLastCommitSha(commit);
        link.setLastPushedRevisionId(captured.revisionId());
        link.setLastPushedAt(clock.instant());
        repos.save(link);
        log.info("Pushed projectId: {} to {} as {} ({} file(s), {} left out)", project.getId(), name, commit, files.size(), leftOut.size());
        return leftOut.size() > MAX_LEFT_OUT ? List.copyOf(leftOut.subList(0, MAX_LEFT_OUT)) : List.copyOf(leftOut);
    }

    private String head(String token, String name, String branch) {
        for (int attempt = 1; ; attempt++) {
            try {
                String sha = client.headSha(token, name, branch);
                if (sha != null) {
                    return sha;
                }
            } catch (GitHubException e) {
                if ((e.status() != 404 && e.status() != 409) || attempt >= HEAD_ATTEMPTS) {
                    throw e;
                }
            }
            if (attempt >= HEAD_ATTEMPTS) {
                throw new GitHubException(409, "the repository has no first commit yet");
            }
            pause();
        }
    }

    private void pause() {
        if (headPause.isZero()) {
            return;
        }
        try {
            Thread.sleep(headPause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GitHubException(0, "The push was interrupted");
        }
    }

    private RuntimeException refused(GitHubException e, Long userId) {
        String reason = e.getMessage() == null || e.getMessage().isBlank() ? "" : " (" + e.getMessage() + ")";
        return switch (e.status()) {
            case 401 -> {
                connections.findById(userId).ifPresent(connections::delete);
                yield new ConflictException("GitHub no longer accepts this connection. Connect your GitHub account again.");
            }
            case 403, 429 -> new ConflictException("GitHub refused the push" + reason + ". Try again in a few minutes.");
            case 404 -> new ConflictException("GitHub could not find the repository or its branch" + reason + ". Push again.");
            case 409 -> new ConflictException("The repository was not ready or changed while the push was being made"
                    + reason + ". Push again.");
            case 422 -> new BadRequestException("GitHub did not accept the push" + reason + ".");
            default -> new ExternalServiceException("GitHub answered " + e.status() + " to a push", e);
        };
    }

    private ProjectGitHubResponse standing(Long projectId, List<String> leftOut) {
        GitHubConnection connection = connections.findById(authUtil.getCurrentUserId()).orElse(null);
        ProjectGitHubRepo link = repos.findById(projectId).orElse(null);
        boolean pushed = link != null && link.getLastCommitSha() != null;
        Long current = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
        String suggested = link != null ? null
                : GitHubRepoName.suggest(projectRepository.findById(projectId).map(Project::getName).orElse(null));
        return new ProjectGitHubResponse(
                available(),
                connection != null,
                connection == null ? null : connection.getLogin(),
                link != null,
                link == null ? null : link.getFullName(),
                link == null ? null : link.getHtmlUrl(),
                link == null ? null : link.isPrivateRepo(),
                link == null ? null : link.getLastPushedAt(),
                link != null && (!pushed || !Objects.equals(current, link.getLastPushedRevisionId())),
                suggested,
                leftOut);
    }

    private static ProjectGitHubRepo linked(Long projectId, Long userId, GitHubClient.Repo repo) {
        return ProjectGitHubRepo.builder()
                .projectId(projectId)
                .pushedBy(userId)
                .repoId(repo.id())
                .fullName(repo.fullName())
                .htmlUrl(repo.htmlUrl())
                .defaultBranch(repo.defaultBranch())
                .privateRepo(repo.privateRepo())
                .createdAt(Instant.now())
                .build();
    }

    static String messageFor(GitHubPushRequest request) {
        if (request == null || request.message() == null) {
            return LATER_MESSAGE;
        }
        String line = request.message().lines()
                .map(text -> text.replaceAll("\\p{Cntrl}", " ").replaceAll("\\s+", " ").strip())
                .filter(text -> !text.isEmpty())
                .findFirst().orElse("");
        if (line.isEmpty()) {
            return LATER_MESSAGE;
        }
        return line.length() <= MESSAGE_LIMIT ? line : line.substring(0, MESSAGE_LIMIT - 3).stripTrailing() + "...";
    }

    static String textOf(byte[] bytes) {
        for (byte value : bytes) {
            if (value == 0) {
                return null;
            }
        }
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    private boolean available() {
        return client != null && cipher != null && properties != null;
    }

    private void requireAvailable() {
        if (!available()) {
            throw new ConflictException("Connecting to GitHub is not set up on this deployment.");
        }
    }
}
