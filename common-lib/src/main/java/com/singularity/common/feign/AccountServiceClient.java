package com.singularity.common.feign;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.dto.UserDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * Every other service's only way to reach User and Plan data, which live in account-service's own database.
 *
 * <p>Handles: the user lookups behind session authentication and member lists, the plan limits behind
 * every quota check, and the revocation check - REVOKED_SESSION exists only in account-service. Resolved through
 * Eureka by spring.application.name.
 *
 * <p>Every call is authenticated by FeignClientInterceptor, which adds the shared secret for any path starting
 * /internal/. That is why this interface must not carry a @FeignClient(path = ...) prefix: interceptors see the
 * request before the prefix is applied, so the check would miss it and every call would 401. There is no shared
 * ErrorDecoder - each call site catches FeignException.NotFound and translates it to the exception that fits its own
 * context.
 *
 * <p>There is no lookup by email address, on purpose. Invitations are held by address and matched to the session of
 * whoever accepts, so no service needs to ask whether an address has an account - and an endpoint that answers that
 * is the thing an invitation must never reveal.
 */
@FeignClient(name = "account-service")
public interface AccountServiceClient {

    @GetMapping("/internal/v1/users/{userId}")
    UserDto getUser(@PathVariable Long userId);

    @GetMapping("/internal/v1/users/by-firebase-uid")
    UserDto getUserByFirebaseUid(@RequestParam String uid);

    @GetMapping("/internal/v1/users/{userId}/plan-limits")
    PlanDto getPlanLimits(@PathVariable Long userId);

    @GetMapping("/internal/v1/sessions/revoked")
    boolean isSessionRevoked(@RequestParam String cookieHash);
}
