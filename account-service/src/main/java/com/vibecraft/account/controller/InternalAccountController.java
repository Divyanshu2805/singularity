package com.vibecraft.account.controller;

import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.repository.RevokedSessionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.service.SubscriptionService;
import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.dto.UserDto;
import com.vibecraft.common.error.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * account-service's API for the other services, not the browser — never routed through gateway-service (see
 * WebSecurityConfig's CSRF exemption and the migration plan's internal-API design decision), and guarded by
 * common-lib's {@code InternalServiceAuthFilter} (a shared secret, not a user's session) rather than by
 * {@code @PreAuthorize} — the caller here is another service acting on a request it already authenticated
 * itself, not an end user.
 *
 * <p>Not yet called by anything: workspace-service and intelligence-service don't exist yet, and
 * legacy-monolith's own equivalent code paths haven't been switched over (see docs/migration/ — that
 * cutover needs a real data migration first, since legacy-monolith's own {@code users} table would otherwise
 * fork from this service's). This exists now so that work doesn't block Phase 2/3 on writing it later.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/internal/v1")
public class InternalAccountController {

    private final UserRepository userRepository;
    private final RevokedSessionRepository revokedSessionRepository;
    private final SubscriptionService subscriptionService;

    @GetMapping("/users/{userId}")
    public UserDto getUser(@PathVariable Long userId) {
        return toDto(userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString())));
    }

    /** Used by workspace-service's invite-by-email flow (ProjectMemberService). */
    @GetMapping("/users/by-username")
    public UserDto getUserByUsername(@RequestParam String username) {
        return toDto(userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User", username)));
    }

    /**
     * Used by workspace-service's (and any future service's) SessionAuthenticator to resolve a Firebase-verified
     * session cookie's uid into a local userId, without owning User itself (see docs/migration/phase-2-workspace-service.md's Phase 2
     * entry - added alongside workspace-service, not part of Phase 1's original scope).
     */
    @GetMapping("/users/by-firebase-uid")
    public UserDto getUserByFirebaseUid(@RequestParam String uid) {
        return toDto(userRepository.findByFirebaseUid(uid)
                .orElseThrow(() -> new ResourceNotFoundException("User", uid)));
    }

    /**
     * Backs every other service's own SessionAuthenticator: REVOKED_SESSION lives only here, since sign-out/
     * sign-out-everywhere is enforced by account-service alone. Added alongside workspace-service for the same
     * reason as {@link #getUserByFirebaseUid} - a service with no local User table can't do this check locally.
     */
    @GetMapping("/sessions/revoked")
    public boolean isSessionRevoked(@RequestParam String cookieHash) {
        return revokedSessionRepository.existsById(cookieHash);
    }

    /** The effective plan's limits — free-tier fallback included — for a quota check made from another service. */
    @GetMapping("/users/{userId}/plan-limits")
    public PlanDto getPlanLimits(@PathVariable Long userId) {
        Plan plan = subscriptionService.getActivePlan(userId);
        if (plan == null) {
            return new PlanDto(null, "Free",
                    SubscriptionService.FREE_TIER_PROJECTS_ALLOWED,
                    SubscriptionService.FREE_TIER_DAILY_TOKENS,
                    SubscriptionService.FREE_TIER_PREVIEWS);
        }
        return new PlanDto(plan.getId(), plan.getName(),
                plan.getMaxProjects() != null ? plan.getMaxProjects() : SubscriptionService.FREE_TIER_PROJECTS_ALLOWED,
                plan.getMaxTokensPerDay() != null ? plan.getMaxTokensPerDay() : SubscriptionService.FREE_TIER_DAILY_TOKENS,
                plan.getMaxPreviews() != null ? plan.getMaxPreviews() : SubscriptionService.FREE_TIER_PREVIEWS);
    }

    private static UserDto toDto(User user) {
        return new UserDto(user.getId(), user.getUsername(), user.getName(), user.getFirebaseUid());
    }
}
