package com.vibecraft.account.security;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cloud.client.DefaultServiceInstance;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Covers that a signed-out session reaches every other service's cache, not just this one's.
 *
 * <p>Uses a real local HTTP server standing in for the sibling services, so what is asserted is the request that
 * actually goes over the wire - path, secret header and body - rather than a mock's recollection of it. Also covers
 * that a sibling being unreachable is survivable, since otherwise a sign-out would fail because another service was
 * down.
 */
class SessionEvictionNotifierTest {

    private record Received(String method, String path, String secretHeader, String body) {
    }

    private static final String SECRET = "test-shared-secret";

    private HttpServer sibling;
    private final List<Received> received = new CopyOnWriteArrayList<>();

    @BeforeEach
    void startSibling() throws IOException {
        sibling = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        sibling.createContext("/", exchange -> {
            received.add(new Received(
                    exchange.getRequestMethod(),
                    exchange.getRequestURI().getPath(),
                    exchange.getRequestHeaders().getFirst("X-Internal-Service-Token"),
                    new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            exchange.sendResponseHeaders(204, -1);
            exchange.close();
        });
        sibling.start();
    }

    @AfterEach
    void stopSibling() {
        sibling.stop(0);
    }

    private int siblingPort() {
        return sibling.getAddress().getPort();
    }

    private static int aPortNothingListensOn() throws IOException {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        }
    }

    private static DiscoveryClient discoveryOf(Map<String, List<ServiceInstance>> instancesByService) {
        return new DiscoveryClient() {
            @Override
            public String description() {
                return "test";
            }

            @Override
            public List<ServiceInstance> getInstances(String serviceId) {
                return instancesByService.getOrDefault(serviceId, List.of());
            }

            @Override
            public List<String> getServices() {
                return List.copyOf(instancesByService.keySet());
            }
        };
    }

    private static ServiceInstance instance(String service, int port) {
        return new DefaultServiceInstance(service + ":" + port, service, "localhost", port, false);
    }

    @Test
    @DisplayName("a signed-out session is sent to every instance of workspace-service and intelligence-service")
    void tellsEveryInstanceOfEveryCachingService() {
        SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of(
                "workspace-service", List.of(instance("workspace-service", siblingPort())),
                "intelligence-service", List.of(instance("intelligence-service", siblingPort())))), SECRET);

        notifier.evictSession("abc123");

        assertThat(received).hasSize(2);
        assertThat(received).allSatisfy(r -> {
            assertThat(r.method()).isEqualTo("POST");
            assertThat(r.path()).isEqualTo("/internal/v1/sessions/evict");
            assertThat(r.secretHeader()).as("the guard on the other side rejects a call without the secret").isEqualTo(SECRET);
            assertThat(r.body()).contains("\"cookieHash\":\"abc123\"");
        });
    }

    @Test
    @DisplayName("every account-service replica is told too, not just workspace and intelligence")
    void tellsEveryAccountServiceReplicaToo() {
        SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of(
                "account-service", List.of(instance("account-service", siblingPort()), instance("account-service-2", siblingPort())))),
                SECRET);

        notifier.evictSession("abc123");

        assertThat(received)
                .as("one call per registered account-service instance - the replica that handled the sign-out is " +
                        "harmless to re-notify (already evicted locally), and a sibling replica is what SEC-12 is " +
                        "about: without this, it keeps authenticating the revoked cookie until its cache entry expires")
                .hasSize(2);
        assertThat(received).allSatisfy(r -> assertThat(r.path()).isEqualTo("/internal/v1/sessions/evict"));
    }

    @Test
    @DisplayName("sign-out-everywhere sends the user's Firebase uid instead of a cookie hash")
    void signOutEverywhereSendsTheUid() {
        SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of(
                "workspace-service", List.of(instance("workspace-service", siblingPort())))), SECRET);

        notifier.evictUser("uid-42");

        assertThat(received).hasSize(1);
        assertThat(received.getFirst().body()).contains("\"firebaseUid\":\"uid-42\"").doesNotContain("\"cookieHash\":\"");
    }

    @Test
    @DisplayName("a service that is down doesn't make sign-out fail, and the reachable one is still told")
    void anUnreachableInstanceIsSkipped() throws IOException {
        int deadPort = aPortNothingListensOn();
        SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of(
                "workspace-service", List.of(instance("workspace-service", deadPort), instance("workspace-service", siblingPort())))), SECRET);

        assertThatCode(() -> notifier.evictSession("abc123")).doesNotThrowAnyException();

        assertThat(received).hasSize(1);
    }

    @Test
    @DisplayName("nothing registered in Eureka is a no-op, not an error")
    void noInstancesIsANoOp() {
        SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of()), SECRET);

        assertThatCode(() -> notifier.evictSession("abc123")).doesNotThrowAnyException();
        assertThat(received).isEmpty();
    }

    @Test
    @DisplayName("a hung instance is cut off by the timeout instead of hanging sign-out")
    void aHungInstanceIsBoundedByTheTimeout() throws IOException {
        CountDownLatch neverAnswer = new CountDownLatch(1);
        HttpServer hung = HttpServer.create(new InetSocketAddress("localhost", 0), 0);
        hung.createContext("/", exchange -> {
            try {
                neverAnswer.await(30, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });
        hung.start();
        try {
            SessionEvictionNotifier notifier = new SessionEvictionNotifier(discoveryOf(Map.of(
                    "workspace-service", List.of(instance("workspace-service", hung.getAddress().getPort())))), SECRET);

            org.junit.jupiter.api.Assertions.assertTimeout(Duration.ofSeconds(4), () -> notifier.evictSession("abc123"));
        } finally {
            neverAnswer.countDown();
            hung.stop(0);
        }
    }
}
