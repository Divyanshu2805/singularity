package com.vibecraft.account.security;

import com.vibecraft.common.dto.EvictSessionRequest;
import com.vibecraft.common.security.InternalServiceAuthFilter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CompletableFuture;

/**
 * Tells every service instance that keeps its own session cache to forget a session that just ended - including this
 * service's own other replicas.
 *
 * <p>Handles: broadcasting either one signed-out session or every session of one user to each instance of
 * account-service, workspace-service and intelligence-service found through Eureka, authenticated with the shared
 * internal-service secret.
 *
 * <p>It exists because each service caches a validated session for app.auth.revocation-check-interval so it is not
 * asking Firebase on every request. account-service's own LocalSessionAuthenticator is no exception: it checks its
 * in-memory SessionCache before the RevokedSession table, so a sign-out that only evicted the replica that handled it
 * left every sibling account-service replica still authenticating that cookie until its cache entry's own TTL passed
 * - a signed-out user routed to a different replica stayed signed in. Including "account-service" in the broadcast
 * list closes that; a call looping back to the replica that initiated the sign-out is harmless; it already evicted
 * its own cache entry before this broadcast runs.
 *
 * <p>Best effort by design: a service that cannot be reached is logged and skipped, and the cache lifetime is still
 * the backstop, so sign-out never fails or hangs because a sibling is down. Calls run in parallel with short timeouts
 * and the caller waits for them, so by the time the sign-out response returns the caches are already clean.
 */
@Slf4j
@Component
public class SessionEvictionNotifier {

    static final List<String> SERVICES = List.of("account-service", "workspace-service", "intelligence-service");

    static final String EVICT_PATH = "/internal/v1/sessions/evict";

    private static final Duration CONNECT_TIMEOUT = Duration.ofMillis(500);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(1);

    private final DiscoveryClient discoveryClient;
    private final RestClient restClient;
    private final String sharedSecret;

    public SessionEvictionNotifier(DiscoveryClient discoveryClient,
                                   @Value("${internal-service.shared-secret}") String sharedSecret) {
        this.discoveryClient = discoveryClient;
        this.sharedSecret = sharedSecret;
        JdkClientHttpRequestFactory requestFactory =
                new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    public void evictSession(String cookieHash) {
        broadcast(EvictSessionRequest.ofSession(cookieHash));
    }

    public void evictUser(String firebaseUid) {
        broadcast(EvictSessionRequest.ofUser(firebaseUid));
    }

    private void broadcast(EvictSessionRequest body) {
        List<CompletableFuture<Void>> calls = SERVICES.stream()
                .flatMap(service -> discoveryClient.getInstances(service).stream())
                .map(instance -> CompletableFuture.runAsync(() -> post(instance, body)))
                .toList();
        CompletableFuture.allOf(calls.toArray(CompletableFuture[]::new)).join();
    }

    private void post(ServiceInstance instance, EvictSessionRequest body) {
        try {
            restClient.post()
                    .uri(instance.getUri().resolve(EVICT_PATH))
                    .header(InternalServiceAuthFilter.HEADER, sharedSecret)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("Couldn't tell {} at {} to drop a session ({}); its cache entry will expire on its own",
                    instance.getServiceId(), instance.getUri(), e.getMessage());
        }
    }
}
