package com.vibecraft.common.security;

import com.vibecraft.common.dto.EvictSessionRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Drops cached sessions at account-service's request.
 *
 * <p>Handles: POST /internal/v1/sessions/evict for every service that keeps a SessionCache - one session by cookie
 * hash, or every session of one user by Firebase uid. account-service calls this when a session ends so the service
 * stops trusting it immediately rather than when the cache entry expires, up to app.auth.revocation-check-interval
 * later.
 *
 * <p>Guarded by the same shared secret as every /internal/v1/** endpoint and never routed through the Gateway.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalSessionController {

    private final SessionCache sessionCache;

    @PostMapping("/sessions/evict")
    public ResponseEntity<Void> evict(@RequestBody EvictSessionRequest request) {
        if (request.cookieHash() != null) {
            sessionCache.evict(request.cookieHash());
        }
        if (request.firebaseUid() != null) {
            sessionCache.evictUser(request.firebaseUid());
        }
        log.info("Session cache entries dropped at account-service's request ({})",
                request.cookieHash() != null ? "one session" : "every session of one user");
        return ResponseEntity.noContent().build();
    }
}
