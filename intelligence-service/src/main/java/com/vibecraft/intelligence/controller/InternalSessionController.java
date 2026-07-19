package com.vibecraft.intelligence.controller;

import com.vibecraft.common.dto.EvictSessionRequest;
import com.vibecraft.intelligence.security.SessionCache;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * account-service calls this when a session ends, so this service stops trusting it now rather than when its
 * {@code SessionCache} entry expires (up to {@code auth.revocation-check-interval}, 60 s, later). Same
 * shared-secret guard as every {@code /internal/v1/**} endpoint; never routed through the Gateway. See
 * account-service's {@code SessionEvictionNotifier} for the sending side and why it exists.
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
