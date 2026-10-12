package com.singularity.workspace.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.GitHubProperties;
import com.singularity.workspace.dto.github.GitHubPushRequest;
import com.singularity.workspace.dto.github.ProjectGitHubResponse;
import com.singularity.workspace.entity.GitHubConnection;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.ProjectGitHubRepo;
import com.singularity.workspace.repository.GitHubConnectionRepository;
import com.singularity.workspace.repository.ProjectGitHubRepoRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.util.GitHubTokenCipher;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * One person's whole path from "Connect GitHub" to a second push, with the real service and the real client talking
 * over HTTP to a stand-in for GitHub that behaves like one: it hands out a code only for the state it was sent, a
 * token only for that code and the app's secret, and keeps repositories, uploads, trees, commits and branches.
 *
 * <p>Handles: the sign-in round trip ending in a stored, encrypted token; a first push making a private repository
 * and leaving its branch on a commit whose tree is the project's files plus a README and a .gitignore, with the
 * environment file left out and a binary file uploaded by itself; and a second push, after a file was deleted from
 * the project, leaving a commit whose parent is the first and whose tree no longer holds that file.
 *
 * <p>The unit tests beside this pin each half against a mock of the other. This one is here because the two halves
 * had only ever met in those mocks: nothing proved that what the service asks for is what the client sends, in an
 * order a git host can use. Only the database and storage are mocked. It is still a stand-in - that the real GitHub
 * accepts the same requests is checked by hand with a registered app.
 */
class GitHubPushFlowTest {

    private static final long USER_ID = 7L;
    private static final long PROJECT_ID = 42L;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Map<String, byte[]> blobs = new HashMap<>();
    private final Map<String, Map<String, String>> trees = new HashMap<>();
    private final Map<String, String[]> commits = new HashMap<>();
    private final Map<String, Object> repository = new LinkedHashMap<>();
    private final List<String> refused = new ArrayList<>();
    private String head;
    private String issuedCode;
    private int next = 1;

    private final Map<Long, GitHubConnection> connectionRows = new HashMap<>();
    private final Map<Long, ProjectGitHubRepo> repoRows = new HashMap<>();
    private final Map<String, byte[]> projectFiles = new LinkedHashMap<>();
    private final AtomicReference<Long> revision = new AtomicReference<>(1L);

    private HttpServer github;
    private GitHubServiceImpl service;
    private GitHubTokenCipher cipher;

    @BeforeEach
    void start() throws IOException {
        github = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        github.createContext("/", this::answer);
        github.start();
        String base = "http://127.0.0.1:" + github.getAddress().getPort();
        String key = Base64.getEncoder().encodeToString("0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8));
        GitHubProperties properties = new GitHubProperties("client-1", "secret-1", key, base, base,
                "https://app.example.dev/github/callback", "repo", null, Duration.ofSeconds(5), 0, 0, 0);
        cipher = new GitHubTokenCipher(key);

        GitHubConnectionRepository connections = mock(GitHubConnectionRepository.class);
        when(connections.findById(any())).thenAnswer(call -> Optional.ofNullable(connectionRows.get(call.<Long>getArgument(0))));
        when(connections.save(any())).thenAnswer(call -> {
            GitHubConnection row = call.getArgument(0);
            connectionRows.put(row.getUserId(), row);
            return row;
        });
        ProjectGitHubRepoRepository repos = mock(ProjectGitHubRepoRepository.class);
        when(repos.findById(any())).thenAnswer(call -> Optional.ofNullable(repoRows.get(call.<Long>getArgument(0))));
        when(repos.save(any())).thenAnswer(call -> {
            ProjectGitHubRepo row = call.getArgument(0);
            repoRows.put(row.getProjectId(), row);
            return row;
        });
        ProjectRepository projects = mock(ProjectRepository.class);
        when(projects.findById(PROJECT_ID)).thenReturn(Optional.of(Project.builder().id(PROJECT_ID).name("Noughts & Crosses").build()));
        when(projects.findCurrentFileRevisionId(PROJECT_ID)).thenAnswer(call -> Optional.of(revision.get()));
        PublishSourceReader reader = mock(PublishSourceReader.class);
        when(reader.capture(PROJECT_ID)).thenAnswer(call ->
                new PublishSourceReader.Captured(revision.get(), new LinkedHashMap<>(projectFiles), 0));
        AuthUtil authUtil = mock(AuthUtil.class);
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);

        service = new GitHubServiceImpl(connections, repos, projects, reader, authUtil, new GitHubClient(properties), cipher,
                properties, Clock.systemUTC());
        service.headPause = Duration.ZERO;

        projectFiles.put("package.json", "{\"scripts\":{\"dev\":\"vite\",\"dev:all\":\"x\",\"start\":\"tsx server/index.ts\"}}".getBytes(StandardCharsets.UTF_8));
        projectFiles.put("start.mjs", "export {};\n".getBytes(StandardCharsets.UTF_8));
        projectFiles.put("server/index.ts", "export {};\n".getBytes(StandardCharsets.UTF_8));
        projectFiles.put("src/Old.tsx", "export const old = 1;\n".getBytes(StandardCharsets.UTF_8));
        projectFiles.put("public/logo.png", new byte[]{(byte) 0x89, 'P', 'N', 'G', 0, 7});
        projectFiles.put(".env", "SECRET=1".getBytes(StandardCharsets.UTF_8));
    }

    @AfterEach
    void stop() {
        github.stop(0);
    }

    @Test
    void connectingThenPushingTwiceLeavesTheRepositoryMatchingTheProjectEachTime() throws Exception {
        String authorize = service.startConnect().url();
        String state = queryOf(authorize).get("state");
        assertThat(queryOf(authorize)).containsEntry("client_id", "client-1").containsEntry("scope", "repo");
        issuedCode = "code-" + state.hashCode();

        assertThat(service.completeConnect(issuedCode, state).login()).isEqualTo("asha");
        assertThat(connectionRows.get(USER_ID).getAccessTokenCipher()).doesNotContain("gho_");
        assertThat(cipher.decrypt(connectionRows.get(USER_ID).getAccessTokenCipher())).isEqualTo("gho_for-asha");

        ProjectGitHubResponse first = service.push(PROJECT_ID, new GitHubPushRequest(null, null, null));

        assertThat(repository).containsEntry("name", "noughts-crosses").containsEntry("private", true).containsEntry("auto_init", true);
        assertThat(first.fullName()).isEqualTo("asha/noughts-crosses");
        assertThat(first.leftOut()).containsExactly(".env");
        assertThat(first.hasChanges()).isFalse();
        String firstCommit = head;
        assertThat(commits.get(firstCommit)[1]).isEqualTo("initial");
        assertThat(commits.get(firstCommit)[2]).isEqualTo("Add the app from Singularity");
        Map<String, String> firstTree = trees.get(commits.get(firstCommit)[0]);
        assertThat(firstTree.keySet()).containsExactlyInAnyOrder(
                "package.json", "start.mjs", "server/index.ts", "src/Old.tsx", "public/logo.png", "README.md", ".gitignore");
        assertThat(blobs.get(firstTree.get("public/logo.png"))).containsExactly(0x89, 'P', 'N', 'G', 0, 7);
        assertThat(text(firstTree.get("server/index.ts"))).isEqualTo("export {};\n");
        assertThat(text(firstTree.get("README.md"))).startsWith("# Noughts & Crosses\n").contains("npm run dev:all").contains("Start command: `npm start`");

        projectFiles.remove("src/Old.tsx");
        projectFiles.put("src/New.tsx", "export const fresh = 2;\n".getBytes(StandardCharsets.UTF_8));
        revision.set(2L);
        assertThat(service.projectStatus(PROJECT_ID).hasChanges()).isTrue();

        ProjectGitHubResponse second = service.push(PROJECT_ID, null);

        assertThat(second.hasChanges()).isFalse();
        assertThat(commits.get(head)[1]).isEqualTo(firstCommit);
        assertThat(commits.get(head)[2]).isEqualTo("Update from Singularity");
        assertThat(trees.get(commits.get(head)[0]).keySet()).contains("src/New.tsx").doesNotContain("src/Old.tsx", ".env");
        assertThat(repoRows.get(PROJECT_ID).getLastCommitSha()).isEqualTo(head);
        assertThat(refused).isEmpty();
    }

    private String text(String blobId) {
        return new String(blobs.get(blobId), StandardCharsets.UTF_8);
    }

    private static Map<String, String> queryOf(String url) {
        Map<String, String> query = new HashMap<>();
        for (String pair : URI.create(url).getRawQuery().split("&")) {
            String[] parts = pair.split("=", 2);
            query.put(parts[0], java.net.URLDecoder.decode(parts[1], StandardCharsets.UTF_8));
        }
        return query;
    }

    @SuppressWarnings("unchecked")
    private void answer(HttpExchange exchange) throws IOException {
        String route = exchange.getRequestMethod() + " " + exchange.getRequestURI().getPath();
        String raw = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Map<String, Object> body = raw.isBlank() ? Map.of() : JSON.readValue(raw, Map.class);
        String authorization = exchange.getRequestHeaders().getFirst("Authorization");
        boolean api = !route.equals("POST /login/oauth/access_token");
        if (api && !"Bearer gho_for-asha".equals(authorization)) {
            refused.add(route);
            send(exchange, 401, Map.of("message", "Bad credentials"));
            return;
        }
        String repo = "/repos/asha/noughts-crosses";
        switch (route) {
            case "POST /login/oauth/access_token" -> {
                boolean good = "client-1".equals(body.get("client_id")) && "secret-1".equals(body.get("client_secret"))
                        && issuedCode != null && issuedCode.equals(body.get("code"));
                send(exchange, 200, good ? Map.of("access_token", "gho_for-asha", "scope", "repo")
                        : Map.of("error", "bad_verification_code"));
            }
            case "GET /user" -> send(exchange, 200, Map.of("id", 4242, "login", "asha"));
            case "POST /user/repos" -> {
                repository.putAll(body);
                commits.put("initial", new String[]{"empty", null, "Initial commit"});
                head = "initial";
                send(exchange, 201, repoJson());
            }
            case "GET /repositories/99" -> send(exchange, 200, repoJson());
            default -> {
                if (route.equals("GET " + repo + "/git/ref/heads/main")) {
                    send(exchange, 200, Map.of("object", Map.of("sha", head)));
                } else if (route.equals("POST " + repo + "/git/blobs")) {
                    String id = "blob-" + next++;
                    blobs.put(id, Base64.getDecoder().decode((String) body.get("content")));
                    send(exchange, 201, Map.of("sha", id));
                } else if (route.equals("POST " + repo + "/git/trees")) {
                    Map<String, String> tree = new LinkedHashMap<>();
                    for (Map<String, Object> entry : (List<Map<String, Object>>) body.get("tree")) {
                        String id = (String) entry.get("sha");
                        if (id == null) {
                            id = "blob-" + next++;
                            blobs.put(id, ((String) entry.get("content")).getBytes(StandardCharsets.UTF_8));
                        }
                        tree.put((String) entry.get("path"), id);
                    }
                    String id = "tree-" + next++;
                    trees.put(id, tree);
                    send(exchange, 201, Map.of("sha", id));
                } else if (route.equals("POST " + repo + "/git/commits")) {
                    String parent = ((List<String>) body.get("parents")).get(0);
                    if (!commits.containsKey(parent) || !trees.containsKey((String) body.get("tree"))) {
                        refused.add(route);
                        send(exchange, 422, Map.of("message", "Parent or tree does not exist"));
                        return;
                    }
                    String id = "commit-" + next++;
                    commits.put(id, new String[]{(String) body.get("tree"), parent, (String) body.get("message")});
                    send(exchange, 201, Map.of("sha", id));
                } else if (route.equals("PATCH " + repo + "/git/refs/heads/main")) {
                    String to = (String) body.get("sha");
                    if (!commits.containsKey(to) || !head.equals(commits.get(to)[1])) {
                        refused.add(route);
                        send(exchange, 422, Map.of("message", "Update is not a fast forward"));
                        return;
                    }
                    head = to;
                    send(exchange, 200, Map.of("ref", "refs/heads/main"));
                } else {
                    refused.add(route);
                    send(exchange, 404, Map.of("message", "Not Found"));
                }
            }
        }
    }

    private Map<String, Object> repoJson() {
        return Map.of("id", 99, "full_name", "asha/" + repository.get("name"),
                "html_url", "https://github.com/asha/" + repository.get("name"), "default_branch", "main",
                "private", Boolean.TRUE.equals(repository.get("private")));
    }

    private static void send(HttpExchange exchange, int status, Map<String, Object> body) throws IOException {
        byte[] bytes = JSON.writeValueAsString(body).getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }
}
