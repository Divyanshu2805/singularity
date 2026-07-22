package com.vibecraft.intelligence.feign;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.dto.UserDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * intelligence-service's own copy of the same Feign client account-service's other callers already have
 * (workspace-service's `AccountServiceClient`). Resolved via Eureka; every call is authenticated by common-lib's
 * {@code FeignClientInterceptor}, which adds the shared-secret header for any path starting {@code /internal/} -
 * so, as there, no {@code @FeignClient(path = ...)} prefix.
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

    @GetMapping("/internal/v1/sessions/revoked")
    boolean isSessionRevoked(@RequestParam String cookieHash);
}
