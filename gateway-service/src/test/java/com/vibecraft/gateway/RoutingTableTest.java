package com.vibecraft.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.cloud.gateway.route.Route;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import reactor.core.publisher.Mono;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false"
})
/**
 * Covers which service owns which URL - the single highest-stakes fact about the Gateway, and one that can be checked
 * exhaustively with no login.
 *
 * <p>Evaluates the real route table, the same one the running Gateway uses and in the order it evaluates it, against
 * every endpoint the browser can call - plus paths that must reach nothing: the internal service-to-service APIs, and
 * URLs that merely share a string prefix with a real route.
 *
 * <p>Routes are path-only, so each URL is listed once even where several verbs share it. When a controller gains or
 * loses an endpoint this list must change in the same commit: a new path that lands on no route is a 404 from the
 * Gateway rather than a compile error, and an internal path that gained a route would be reachable from the browser.
 */
class RoutingTableTest {

    static final String INTELLIGENCE_CODE = "intelligence-code-insight";
    static final String INTELLIGENCE = "intelligence";
    static final String WORKSPACE = "workspace";
    static final String ACCOUNT = "account";
    static final String NO_ROUTE = "(no route)";

    @Autowired
    private RouteLocator routeLocator;

    static Stream<Arguments> ownedPaths() {
        Map<String, List<String>> pathsByRoute = Map.of(
                ACCOUNT, List.of(
                        "/api/auth/csrf",
                        "/api/auth/session",
                        "/api/auth/logout",
                        "/api/auth/logout-all",
                        "/api/auth/me",
                        "/api/auth/security-events",
                        "/api/plans",
                        "/api/me/subscription",
                        "/api/payments/checkout",
                        "/api/payments/portal",
                        "/api/payments/change-plan",
                        "/api/payments/confirm",
                        "/webhooks/payment"),
                WORKSPACE, List.of(
                        "/api/projects",
                        "/api/projects/7",
                        "/api/projects/from-prompt",
                        "/api/projects/7/fork",
                        "/api/projects/7/retry-template-init",
                        "/api/projects/7/pin",
                        "/api/projects/7/star",
                        "/api/projects/7/members",
                        "/api/projects/7/members/accept",
                        "/api/projects/7/members/9",
                        "/api/projects/7/files",
                        "/api/projects/7/files/content",
                        "/api/projects/7/files/search",
                        "/api/projects/7/files/download-zip",
                        "/api/projects/7/preview",
                        "/api/projects/7/deploy",
                        "/api/projects/7/preview/restart",
                        "/api/projects/7/preview/logs",
                        "/api/projects/7/revisions",
                        "/api/projects/7/revisions/12/preview",
                        "/api/projects/7/revisions/12/restore",
                        "/api/previews"),
                INTELLIGENCE, List.of(
                        "/api/chat/stream",
                        "/api/chat/projects/7",
                        "/api/chat/projects/7/last-turn-changes",
                        "/api/chat/projects/7/active",
                        "/api/chat/projects/7/active/stream",
                        "/api/chat/projects/7/active/stop",
                        "/api/ideas/clarify",
                        "/api/ideas/compile",
                        "/api/usage/today",
                        "/api/usage/insights",
                        "/api/usage/events",
                        "/api/usage/events/export",
                        "/api/usage/limits"),
                INTELLIGENCE_CODE, List.of(
                        "/api/projects/7/code/explain",
                        "/api/projects/7/code/explain/stream",
                        "/api/projects/7/code/ask",
                        "/api/projects/7/code/ask/stream",
                        "/api/projects/7/code/notes",
                        "/api/projects/7/code/notes/3"),
                NO_ROUTE, List.of(
                        "/internal/v1/users/1",
                        "/internal/v1/projects/7/members/3",
                        "/internal/v1/sessions/evict",
                        "/api/projects-archive",
                        "/api/chatter",
                        "/nope"));

        return pathsByRoute.entrySet().stream()
                .flatMap(entry -> entry.getValue().stream().map(path -> Arguments.of(path, entry.getKey())));
    }

    @ParameterizedTest(name = "{0} -> {1}")
    @MethodSource("ownedPaths")
    @DisplayName("every URL is claimed by exactly the route that owns it, and unowned URLs by none")
    void routesToOwningRoute(String path, String expectedRouteId) {
        assertThat(firstMatchingRouteId(path)).isEqualTo(NO_ROUTE.equals(expectedRouteId) ? null : expectedRouteId);
    }

    @Test
    @DisplayName("a project's code-insight URLs go to intelligence-service, its files/members/preview to workspace-service")
    void codeInsightPrecedesTheGenericProjectsRoute() {
        assertThat(firstMatchingRouteId("/api/projects/7/code/explain")).isEqualTo(INTELLIGENCE_CODE);
        assertThat(firstMatchingRouteId("/api/projects/7/files")).isEqualTo(WORKSPACE);
        assertThat(firstMatchingRouteId("/api/projects/7/codex")).isEqualTo(WORKSPACE);
    }

    @Test
    @DisplayName("exactly four routes exist, evaluated in the documented order, with no catch-all")
    void routeOrder() {
        assertThat(routes()).extracting(Route::getId)
                .containsExactly(INTELLIGENCE_CODE, INTELLIGENCE, WORKSPACE, ACCOUNT);
    }

    @Test
    @DisplayName("each domain resolves to its own service by Eureka name")
    void domainsGoToTheirOwnServices() {
        assertThat(uriOf(ACCOUNT)).isEqualTo(URI.create("lb://account-service"));
        assertThat(uriOf(WORKSPACE)).isEqualTo(URI.create("lb://workspace-service"));
        assertThat(uriOf(INTELLIGENCE)).isEqualTo(URI.create("lb://intelligence-service"));
        assertThat(uriOf(INTELLIGENCE_CODE)).isEqualTo(URI.create("lb://intelligence-service"));
    }

    private URI uriOf(String routeId) {
        return routes().stream().filter(route -> route.getId().equals(routeId)).findFirst()
                .orElseThrow(() -> new AssertionError("no route with id " + routeId)).getUri();
    }

    private List<Route> routes() {
        return routeLocator.getRoutes().collectList().block();
    }

    private String firstMatchingRouteId(String path) {
        for (Route route : routes()) {
            MockServerWebExchange exchange = MockServerWebExchange.from(MockServerHttpRequest.get(path).build());
            if (Boolean.TRUE.equals(Mono.from(route.getPredicate().apply(exchange)).block())) {
                return route.getId();
            }
        }
        return null;
    }
}
