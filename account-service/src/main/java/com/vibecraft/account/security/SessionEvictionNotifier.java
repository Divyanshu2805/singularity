package com.vibecraft.account.security;

import com.vibecraft.common.dto.EvictSessionRequest;
import com.vibecraft.common.jwt.InternalServiceAuthFilter;
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
 * Tells every other service that keeps its own session cache to forget a session that just ended.
 *
 * <p>Each service caches a validated session for {@code auth.revocation-check-interval} (60 s) so it isn't asking
 * Firebase on every request. In the monolith a sign-out evicted that one cache on the spot. Split across services,
 * account-service evicts only its own - so without this, a signed-out cookie kept working against workspace-service
 * and intelligence-service until their entries expired, up to a minute later (sign-out-everywhere likewise).
 *
 * <p>Every instance of each service is told, found through Eureka. Best effort by design: a service that can't be
 * reached is logged and skipped, and the 60 s cache lifetime is still the backstop, so sign-out never fails or
 * hangs because a sibling is down. Calls run in parallel with short timeouts, and the caller waits for them, so
 * once the sign-out response has returned the caches are already clean.
 */
@Slf4j
@Component
public class SessionEvictionNotifier {

    /** The services that keep their own {@code SessionCache}. account-service is the one doing the telling. */
    static final List<String> SERVICES = List.of("workspace-service", "intelligence-service");

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

    /** One signed-out session. */
    public void evictSession(String cookieHash) {
        broadcast(EvictSessionRequest.ofSession(cookieHash));
    }

    /** Every cached session of one user ("sign out everywhere"). */
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
