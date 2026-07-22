package com.vibecraft.workspace.feign;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.dto.UserDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * workspace-service's only way to reach User/Plan data now that it lives in account-service's own database.
 * Resolved via Eureka ("account-service" is that service's {@code spring.application.name}). Every call is
 * authenticated by common-lib's {@code FeignClientInterceptor}, which adds the shared-secret header for any path
 * starting {@code /internal/} - which is why this interface must not carry a {@code @FeignClient(path = ...)}
 * prefix: the interceptor would stop seeing {@code /internal/} and every call would be a 401.
 *
 * <p>Every call site using this client catches {@code feign.FeignException.NotFound} locally and translates it
 * to the matching typed exception - no shared {@code ErrorDecoder} exists yet (see docs/migration/'s
 * Phase 2 entry for why that's deferred rather than added here).
 */
@FeignClient(name = "account-service")
public interface AccountServiceClient {

    @GetMapping("/internal/v1/users/{userId}")
    UserDto getUser(@PathVariable Long userId);

    @GetMapping("/internal/v1/users/by-username")
    UserDto getUserByUsername(@RequestParam String username);

    @GetMapping("/internal/v1/users/by-firebase-uid")
    UserDto getUserByFirebaseUid(@RequestParam String uid);

    @GetMapping("/internal/v1/users/{userId}/plan-limits")
    PlanDto getPlanLimits(@PathVariable Long userId);

    /** Backs SessionAuthenticator's revocation check - REVOKED_SESSION lives only in account-service's database. */
    @GetMapping("/internal/v1/sessions/revoked")
    boolean isSessionRevoked(@RequestParam String cookieHash);
}
