package com.vibecraft.intelligence.controller;

import com.vibecraft.common.dto.EvictSessionRequest;
import com.vibecraft.intelligence.security.SessionCache;
import com.vibecraft.intelligence.security.UserPrincipal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** What account-service's sign-out notification actually does to this service's own session cache. */
class InternalSessionControllerTest {

    private static final Instant NOW = Instant.parse("2026-09-20T10:00:00Z");

    private final SessionCache cache = new SessionCache();
    private final InternalSessionController controller = new InternalSessionController(cache);

    private void cached(String hash, String firebaseUid) {
        cache.put(hash, new UserPrincipal(1L, "a@example.com", firebaseUid, List.of()), NOW.plusSeconds(60), NOW);
    }

    @Test
    @DisplayName("a signed-out session stops being trusted at once, not when its cache entry would have expired")
    void evictsOneSession() {
        cached("h1", "uid-1");
        cached("h2", "uid-1");
        assertThat(cache.get("h1", NOW)).isPresent();

        var response = controller.evict(EvictSessionRequest.ofSession("h1"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(cache.get("h1", NOW)).isEmpty();
        assertThat(cache.get("h2", NOW)).as("the same user's other session is untouched").isPresent();
    }

    @Test
    @DisplayName("sign-out-everywhere drops every cached session of that user and nobody else's")
    void evictsEverySessionOfOneUser() {
        cached("h1", "uid-1");
        cached("h2", "uid-1");
        cached("h3", "uid-2");

        controller.evict(EvictSessionRequest.ofUser("uid-1"));

        assertThat(cache.get("h1", NOW)).isEmpty();
        assertThat(cache.get("h2", NOW)).isEmpty();
        assertThat(cache.get("h3", NOW)).as("another user's session").isPresent();
    }

    @Test
    @DisplayName("an empty request is a harmless no-op")
    void emptyRequestChangesNothing() {
        cached("h1", "uid-1");

        var response = controller.evict(new EvictSessionRequest(null, null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(cache.get("h1", NOW)).isPresent();
    }
}
