package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.GitHubProperties;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The calls this service makes to GitHub, and nothing else about them.
 *
 * <p>Handles: the address a person is sent to so they can agree to the connection; exchanging the code GitHub sends
 * back for a token; reading whose token it is; making a repository; reading one by its id; and the four calls that
 * put a set of files into a repository as one commit - the branch's head, an upload of one file's bytes, a tree of
 * every file, a commit of that tree, and moving the branch to it. It also asks GitHub to forget the connection.
 *
 * <p>A commit is made through GitHub's own API rather than with git. No program is run and nothing is written to
 * this machine's disk: the files go from storage to GitHub as requests. The tree is given whole, with no base, so
 * the commit holds exactly the files that were sent and a file since deleted from the project is deleted there too.
 *
 * <p>Every address is built from the two configured ones. A repository's name comes from GitHub's own answers and a
 * path from the project's stored, validated paths; each part is percent-encoded all the same, so nothing in a name
 * can change which address is called.
 *
 * <p>Whatever GitHub answers that is not a success is thrown as {@link GitHubException} with the status, for the
 * caller to turn into a sentence: it is the caller that knows whether a 404 means a repository was deleted or a
 * branch is not there yet. The token is sent in a header and is never part of a message or a log line here.
 */
public class GitHubClient {

    public record Grant(String accessToken, String scope) {
    }

    public record Account(long id, String login) {
    }

    public record Repo(long id, String fullName, String htmlUrl, String defaultBranch, boolean privateRepo) {
    }

    public record TreeEntry(String path, String content, String blobSha) {
    }

    public static class GitHubException extends RuntimeException {
        private final int status;

        public GitHubException(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final int MAX_ERROR_CHARS = 300;

    private final GitHubProperties properties;
    private final HttpClient http;

    public GitHubClient(GitHubProperties properties) {
        this.properties = properties;
        this.http = HttpClient.newBuilder()
                .connectTimeout(properties.requestTimeout())
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public String authorizeUrl(String state) {
        return properties.webUrl() + "/login/oauth/authorize"
                + "?client_id=" + encode(properties.clientId())
                + "&redirect_uri=" + encode(properties.callbackUrl())
                + "&scope=" + encode(properties.scope())
                + "&state=" + encode(state)
                + "&allow_signup=true";
    }

    public Grant exchange(String code) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("client_id", properties.clientId());
        body.put("client_secret", properties.clientSecret());
        body.put("code", code);
        body.put("redirect_uri", properties.callbackUrl());
        Map<String, Object> answer = send(HttpRequest.newBuilder(URI.create(properties.webUrl() + "/login/oauth/access_token"))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))), 200);
        Object token = answer.get("access_token");
        if (!(token instanceof String value) || value.isBlank()) {
            throw new GitHubException(400, "GitHub did not accept the sign-in: " + text(answer.get("error_description"), text(answer.get("error"), "no reason given")));
        }
        return new Grant(value, text(answer.get("scope"), ""));
    }

    public Account account(String token) {
        Map<String, Object> answer = send(api(token, "/user").GET(), 200);
        return new Account(number(answer.get("id")), text(answer.get("login"), ""));
    }

    public Repo createRepository(String token, String name, boolean privateRepo, String description) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("private", privateRepo);
        body.put("auto_init", true);
        body.put("description", description);
        return repo(send(api(token, "/user/repos").POST(json(body)), 201));
    }

    public Repo repository(String token, long repoId) {
        return repo(send(api(token, "/repositories/" + repoId).GET(), 200));
    }

    public String headSha(String token, String fullName, String branch) {
        Map<String, Object> answer = send(api(token, "/repos/" + path(fullName) + "/git/ref/heads/" + path(branch)).GET(), 200);
        return text(child(answer, "object").get("sha"), null);
    }

    public String createBlob(String token, String fullName, byte[] bytes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", Base64.getEncoder().encodeToString(bytes));
        body.put("encoding", "base64");
        return text(send(api(token, "/repos/" + path(fullName) + "/git/blobs").POST(json(body)), 201).get("sha"), null);
    }

    public String createTree(String token, String fullName, List<TreeEntry> entries) {
        List<Map<String, Object>> tree = new ArrayList<>();
        for (TreeEntry entry : entries) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("path", entry.path());
            item.put("mode", "100644");
            item.put("type", "blob");
            if (entry.blobSha() != null) {
                item.put("sha", entry.blobSha());
            } else {
                item.put("content", entry.content());
            }
            tree.add(item);
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("tree", tree);
        return text(send(api(token, "/repos/" + path(fullName) + "/git/trees").POST(json(body)), 201).get("sha"), null);
    }

    public String createCommit(String token, String fullName, String message, String treeSha, String parentSha) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", message);
        body.put("tree", treeSha);
        body.put("parents", List.of(parentSha));
        return text(send(api(token, "/repos/" + path(fullName) + "/git/commits").POST(json(body)), 201).get("sha"), null);
    }

    public void moveBranch(String token, String fullName, String branch, String commitSha) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("sha", commitSha);
        body.put("force", false);
        send(api(token, "/repos/" + path(fullName) + "/git/refs/heads/" + path(branch))
                .method("PATCH", json(body)), 200);
    }

    public void forget(String token) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", token);
        String basic = Base64.getEncoder().encodeToString(
                (properties.clientId() + ":" + properties.clientSecret()).getBytes(StandardCharsets.UTF_8));
        send(HttpRequest.newBuilder(URI.create(properties.apiUrl() + "/applications/" + path(properties.clientId()) + "/grant"))
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", "Basic " + basic)
                .header("Content-Type", "application/json")
                .method("DELETE", json(body)), 204);
    }

    private HttpRequest.Builder api(String token, String pathAndQuery) {
        return HttpRequest.newBuilder(URI.create(properties.apiUrl() + pathAndQuery))
                .header("Accept", "application/vnd.github+json")
                .header("Authorization", "Bearer " + token)
                .header("X-GitHub-Api-Version", "2022-11-28")
                .header("Content-Type", "application/json")
                .header("User-Agent", "singularity-workspace");
    }

    private static HttpRequest.BodyPublisher json(Map<String, Object> body) {
        return HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body), StandardCharsets.UTF_8);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> send(HttpRequest.Builder request, int expected) {
        HttpResponse<String> response;
        try {
            response = http.send(request.timeout(properties.requestTimeout()).build(),
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new GitHubException(0, "GitHub could not be reached: " + e.getClass().getSimpleName());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new GitHubException(0, "The call to GitHub was interrupted");
        }
        String body = response.body() == null ? "" : response.body();
        if (response.statusCode() != expected) {
            throw new GitHubException(response.statusCode(), reason(body));
        }
        if (body.isBlank()) {
            return Map.of();
        }
        try {
            return JSON.readValue(body, Map.class);
        } catch (RuntimeException e) {
            throw new GitHubException(response.statusCode(), "GitHub answered with something that is not JSON");
        }
    }

    @SuppressWarnings("unchecked")
    private static String reason(String body) {
        try {
            Map<String, Object> error = JSON.readValue(body, Map.class);
            StringBuilder text = new StringBuilder(text(error.get("message"), ""));
            if (error.get("errors") instanceof List<?> details) {
                for (Object detail : details) {
                    if (detail instanceof Map<?, ?> fields && fields.get("message") != null) {
                        text.append(text.isEmpty() ? "" : " - ").append(fields.get("message"));
                    }
                }
            }
            String message = text.toString();
            return message.length() > MAX_ERROR_CHARS ? message.substring(0, MAX_ERROR_CHARS) : message;
        } catch (RuntimeException e) {
            return "";
        }
    }

    private static Repo repo(Map<String, Object> answer) {
        return new Repo(number(answer.get("id")), text(answer.get("full_name"), ""), text(answer.get("html_url"), ""),
                text(answer.get("default_branch"), "main"), Boolean.TRUE.equals(answer.get("private")));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> child(Map<String, Object> answer, String key) {
        return answer.get(key) instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private static long number(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private static String text(Object value, String fallback) {
        return value instanceof String string && !string.isBlank() ? string : fallback;
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static String path(String value) {
        StringBuilder encoded = new StringBuilder();
        for (String segment : value.split("/", -1)) {
            if (!encoded.isEmpty()) {
                encoded.append('/');
            }
            encoded.append(URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20"));
        }
        return encoded.toString();
    }
}
