package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.GitHubProperties;
import com.singularity.workspace.service.impl.GitHubClient.GitHubException;
import com.singularity.workspace.service.impl.GitHubClient.TreeEntry;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests for {@link GitHubClient} against a stand-in for GitHub on a local port.
 *
 * <p>Handles: the address a person is sent to carrying the app, the callback, the scope and the state; the exchange
 * of a code sending the secret in the body and reading the token, and a refused code being an error; each call that
 * makes a commit going to the address GitHub documents with the token in a header and the body GitHub expects - a
 * repository made with a first commit, a tree given whole with text inline and uploaded files by their id, a commit
 * with one parent, a branch moved without force; a name with a character that matters in an address being encoded;
 * and anything that is not the expected answer being thrown with its status and GitHub's own words.
 *
 * <p>The stand-in records what it was sent and answers from a script, so what is pinned here is the shape of each
 * request. Whether the real GitHub accepts those shapes is checked by hand with a registered app.
 */
class GitHubClientTest {

    private record Sent(String method, String path, Map<String, String> headers, String body) {
    }

    private final List<Sent> sent = new ArrayList<>();
    private final Map<String, String[]> answers = new LinkedHashMap<>();
    private HttpServer server;
    private GitHubClient client;

    @BeforeEach
    void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            Map<String, String> headers = new LinkedHashMap<>();
            exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(), values.get(0)));
            String path = exchange.getRequestURI().getRawPath();
            sent.add(new Sent(exchange.getRequestMethod(), path, headers,
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            String[] answer = answers.getOrDefault(exchange.getRequestMethod() + " " + path, new String[]{"404", "{\"message\":\"Not Found\"}"});
            byte[] bytes = answer[1].getBytes(StandardCharsets.UTF_8);
            int status = Integer.parseInt(answer[0]);
            exchange.sendResponseHeaders(status, status == 204 ? -1 : bytes.length);
            if (status != 204) {
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        });
        server.start();
        String base = "http://127.0.0.1:" + server.getAddress().getPort();
        client = new GitHubClient(new GitHubProperties("client-1", "secret-1", Base64.getEncoder().encodeToString(new byte[32]),
                base + "/", base, "https://app.example.dev/github/callback", "repo", null, Duration.ofSeconds(5), 0, 0, 0));
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private void answer(String methodAndPath, int status, String body) {
        answers.put(methodAndPath, new String[]{String.valueOf(status), body});
    }

    private Sent only() {
        assertThat(sent).hasSize(1);
        return sent.get(0);
    }

    @Test
    void theAddressAPersonIsSentToCarriesTheAppTheCallbackTheScopeAndTheState() {
        String url = client.authorizeUrl("7.123.abc.sig");

        assertThat(url).startsWith("http://127.0.0.1:" + server.getAddress().getPort() + "/login/oauth/authorize?")
                .contains("client_id=client-1")
                .contains("redirect_uri=https%3A%2F%2Fapp.example.dev%2Fgithub%2Fcallback")
                .contains("scope=repo")
                .contains("state=7.123.abc.sig")
                .doesNotContain("secret-1");
    }

    @Test
    void aCodeIsExchangedForATokenWithTheSecretInTheBody() {
        answer("POST /login/oauth/access_token", 200, "{\"access_token\":\"gho_abc\",\"scope\":\"repo\",\"token_type\":\"bearer\"}");

        GitHubClient.Grant grant = client.exchange("code-9");

        assertThat(grant.accessToken()).isEqualTo("gho_abc");
        assertThat(grant.scope()).isEqualTo("repo");
        assertThat(only().headers()).containsEntry("accept", "application/json");
        assertThat(only().body()).contains("\"client_id\":\"client-1\"").contains("\"client_secret\":\"secret-1\"")
                .contains("\"code\":\"code-9\"").contains("\"redirect_uri\":\"https://app.example.dev/github/callback\"");
    }

    @Test
    void aCodeGitHubRefusesIsAnErrorThoughTheAnswerIsA200() {
        answer("POST /login/oauth/access_token", 200, "{\"error\":\"bad_verification_code\",\"error_description\":\"The code passed is incorrect or expired.\"}");

        assertThatThrownBy(() -> client.exchange("old")).isInstanceOf(GitHubException.class)
                .hasMessageContaining("incorrect or expired")
                .satisfies(e -> assertThat(((GitHubException) e).status()).isEqualTo(400));
    }

    @Test
    void theAccountIsReadWithTheTokenInAHeader() {
        answer("GET /user", 200, "{\"id\":4242,\"login\":\"asha\"}");

        assertThat(client.account("gho_abc")).isEqualTo(new GitHubClient.Account(4242L, "asha"));
        assertThat(only().headers()).containsEntry("authorization", "Bearer gho_abc")
                .containsEntry("accept", "application/vnd.github+json").containsEntry("x-github-api-version", "2022-11-28");
    }

    @Test
    void aRepositoryIsMadePrivateWithAFirstCommitSoItHasABranchToPushTo() {
        answer("POST /user/repos", 201, "{\"id\":99,\"full_name\":\"asha/noughts\",\"html_url\":\"https://github.com/asha/noughts\",\"default_branch\":\"main\",\"private\":true}");

        GitHubClient.Repo repo = client.createRepository("gho_abc", "noughts", true, "Built with Singularity");

        assertThat(repo).isEqualTo(new GitHubClient.Repo(99L, "asha/noughts", "https://github.com/asha/noughts", "main", true));
        assertThat(only().body()).contains("\"name\":\"noughts\"").contains("\"private\":true").contains("\"auto_init\":true");
    }

    @Test
    void aRepositoryIsFoundAgainByItsIdWhateverItIsNowCalled() {
        answer("GET /repositories/99", 200, "{\"id\":99,\"full_name\":\"asha/renamed\",\"html_url\":\"https://github.com/asha/renamed\",\"default_branch\":\"trunk\",\"private\":false}");

        assertThat(client.repository("gho_abc", 99L)).isEqualTo(
                new GitHubClient.Repo(99L, "asha/renamed", "https://github.com/asha/renamed", "trunk", false));
    }

    @Test
    void theFourCallsOfACommitGoWhereGitHubDocumentsWithTheBodiesItExpects() {
        answer("GET /repos/asha/noughts/git/ref/heads/main", 200, "{\"ref\":\"refs/heads/main\",\"object\":{\"sha\":\"head-1\"}}");
        answer("POST /repos/asha/noughts/git/blobs", 201, "{\"sha\":\"blob-1\"}");
        answer("POST /repos/asha/noughts/git/trees", 201, "{\"sha\":\"tree-1\"}");
        answer("POST /repos/asha/noughts/git/commits", 201, "{\"sha\":\"commit-1\"}");
        answer("PATCH /repos/asha/noughts/git/refs/heads/main", 200, "{\"ref\":\"refs/heads/main\"}");

        assertThat(client.headSha("gho_abc", "asha/noughts", "main")).isEqualTo("head-1");
        assertThat(client.createBlob("gho_abc", "asha/noughts", new byte[]{1, 2, 3})).isEqualTo("blob-1");
        assertThat(client.createTree("gho_abc", "asha/noughts", List.of(
                new TreeEntry("src/App.tsx", "export default 1;\n", null),
                new TreeEntry("public/logo.png", null, "blob-1")))).isEqualTo("tree-1");
        assertThat(client.createCommit("gho_abc", "asha/noughts", "Update from Singularity", "tree-1", "head-1")).isEqualTo("commit-1");
        client.moveBranch("gho_abc", "asha/noughts", "main", "commit-1");

        assertThat(sent.get(1).body()).isEqualTo("{\"content\":\"AQID\",\"encoding\":\"base64\"}");
        assertThat(sent.get(2).body())
                .contains("{\"path\":\"src/App.tsx\",\"mode\":\"100644\",\"type\":\"blob\",\"content\":\"export default 1;\\n\"}")
                .contains("{\"path\":\"public/logo.png\",\"mode\":\"100644\",\"type\":\"blob\",\"sha\":\"blob-1\"}")
                .doesNotContain("base_tree");
        assertThat(sent.get(3).body()).isEqualTo("{\"message\":\"Update from Singularity\",\"tree\":\"tree-1\",\"parents\":[\"head-1\"]}");
        assertThat(sent.get(4).method()).isEqualTo("PATCH");
        assertThat(sent.get(4).body()).isEqualTo("{\"sha\":\"commit-1\",\"force\":false}");
        assertThat(sent).allSatisfy(request -> assertThat(request.headers()).containsEntry("authorization", "Bearer gho_abc"));
    }

    @Test
    void aBranchNameWithACharacterThatMattersInAnAddressIsEncoded() {
        answer("GET /repos/asha/noughts/git/ref/heads/feature/a%23b%3Fc", 200, "{\"object\":{\"sha\":\"head-2\"}}");

        assertThat(client.headSha("gho_abc", "asha/noughts", "feature/a#b?c")).isEqualTo("head-2");
    }

    @Test
    void anythingButTheExpectedAnswerIsThrownWithItsStatusAndGitHubsOwnWords() {
        answer("POST /user/repos", 422, "{\"message\":\"Repository creation failed.\",\"errors\":[{\"resource\":\"Repository\",\"code\":\"custom\",\"field\":\"name\",\"message\":\"name already exists on this account\"}]}");
        answer("GET /user", 401, "{\"message\":\"Bad credentials\"}");

        assertThatThrownBy(() -> client.createRepository("gho_abc", "noughts", true, "x")).isInstanceOf(GitHubException.class)
                .hasMessage("Repository creation failed. - name already exists on this account")
                .satisfies(e -> assertThat(((GitHubException) e).status()).isEqualTo(422));
        assertThatThrownBy(() -> client.account("gho_dead")).isInstanceOf(GitHubException.class)
                .hasMessage("Bad credentials").hasMessageNotContaining("gho_dead")
                .satisfies(e -> assertThat(((GitHubException) e).status()).isEqualTo(401));
        assertThatThrownBy(() -> client.headSha("gho_abc", "asha/gone", "main"))
                .satisfies(e -> assertThat(((GitHubException) e).status()).isEqualTo(404));
    }

    @Test
    void forgettingAConnectionIsAskedWithTheAppsOwnNameAndSecretNotTheToken() {
        answer("DELETE /applications/client-1/grant", 204, "");

        client.forget("gho_abc");

        assertThat(only().headers().get("authorization")).isEqualTo("Basic "
                + Base64.getEncoder().encodeToString("client-1:secret-1".getBytes(StandardCharsets.UTF_8)));
        assertThat(only().body()).isEqualTo("{\"access_token\":\"gho_abc\"}");
    }

    @Test
    void aGitHubThatCannotBeReachedIsAnErrorWithNoStatus() {
        server.stop(0);

        assertThatThrownBy(() -> client.account("gho_abc")).isInstanceOf(GitHubException.class)
                .satisfies(e -> assertThat(((GitHubException) e).status()).isZero());
    }
}
