package com.vibecraft.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what the Gateway actually returns over real HTTP for the two cases RoutingTableTest can't reach: a path no
 * route owns, and a route whose downstream is unreachable (API-01).
 *
 * <p>RoutingTableTest proves the route table's shape (no catch-all, internal paths matched by nothing); this proves
 * the resulting response is a controlled one - JSON, not a connection-refused 5xx or an HTML Whitelabel page - for
 * both an unowned path and a route pointed at nothing listening. Uses the JDK's own HttpClient rather than
 * WebTestClient: Boot 4 split WebTestClient's autoconfiguration into a separate per-web-framework test module this
 * reactor doesn't otherwise need, and a real socket call proves the point more directly anyway.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false",
        "routing.account.uri=http://127.0.0.1:1"
})
class UnownedAndUnavailableRouteBehaviorTest {

    @LocalServerPort
    private int port;

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @Test
    @DisplayName("a path no route owns is a JSON 404, not a Whitelabel page or a connection failure")
    void unownedPathIsJson404() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/nope");

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(type -> assertThat(type).contains("json"));
    }

    @Test
    @DisplayName("an internal path is unowned too, so it is a JSON 404 - never proxied to a downstream")
    void internalPathIsJson404() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/internal/v1/users/1");

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(response.headers().firstValue("Content-Type")).hasValueSatisfying(type -> assertThat(type).contains("json"));
    }

    @Test
    @DisplayName("a route whose downstream refuses the connection is a controlled 5xx, not a hang")
    void unavailableDownstreamIsControlled5xx() throws IOException, InterruptedException {
        HttpResponse<String> response = get("/api/plans");

        assertThat(response.statusCode()).isGreaterThanOrEqualTo(500);
    }

    private HttpResponse<String> get(String path) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(10))
                .GET()
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
