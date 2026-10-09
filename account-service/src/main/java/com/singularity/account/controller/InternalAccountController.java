package com.singularity.account.controller;

import com.singularity.account.entity.Plan;
import com.singularity.account.entity.User;
import com.singularity.account.repository.RevokedSessionRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.service.SubscriptionService;
import com.singularity.common.dto.PlanDto;
import com.singularity.common.dto.UserDto;
import com.singularity.common.error.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * account-service's API for the other services, not the browser.
 *
 * <p>Handles: resolving a user by id or Firebase uid; answering whether a session cookie hash has been
 * revoked; and serving a user's effective plan limits with the free-tier fallback already folded in, so no caller has
 * to know what "no subscription" means.
 *
 * <p>Called by workspace-service and intelligence-service, whose SessionAuthenticator makes the uid and revocation
 * lookups on every cache miss and whose quota checks ask for the limits. Never routed through the Gateway, and
 * guarded by the shared internal-service secret rather than a session - the caller is another service acting on a
 * request it has already authenticated itself, so these endpoints answer for an arbitrary user id with no ownership
 * check of their own.
 *
 * <p>The lookup by Firebase uid is the one every other service authenticates a session with, so it answers 404 for a
 * deleted account exactly as for one that never existed: before that, a deleted user's still-valid cookie was
 * refused here in account-service and accepted everywhere else. The lookup by id still returns a deleted account,
 * because it only ever names someone - a member list or the sender of an invitation - and never authenticates.
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

    @GetMapping("/users/by-firebase-uid")
    public UserDto getUserByFirebaseUid(@RequestParam String uid) {
        return toDto(userRepository.findByFirebaseUid(uid)
                .filter(user -> user.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("User", uid)));
    }

    @GetMapping("/sessions/revoked")
    public boolean isSessionRevoked(@RequestParam String cookieHash) {
        return revokedSessionRepository.existsById(cookieHash);
    }

    @GetMapping("/users/{userId}/plan-limits")
    public PlanDto getPlanLimits(@PathVariable Long userId) {
        Plan plan = subscriptionService.getActivePlan(userId);
        if (plan == null) {
            return new PlanDto(null, "Free",
                    SubscriptionService.FREE_TIER_PROJECTS_ALLOWED,
                    SubscriptionService.FREE_TIER_DAILY_TOKENS,
                    SubscriptionService.FREE_TIER_PREVIEWS,
                    false);
        }
        return new PlanDto(plan.getId(), plan.getName(),
                plan.getMaxProjects() != null ? plan.getMaxProjects() : SubscriptionService.FREE_TIER_PROJECTS_ALLOWED,
                plan.getMaxTokensPerDay() != null ? plan.getMaxTokensPerDay() : SubscriptionService.FREE_TIER_DAILY_TOKENS,
                plan.getMaxPreviews() != null ? plan.getMaxPreviews() : SubscriptionService.FREE_TIER_PREVIEWS,
                Boolean.TRUE.equals(plan.getUnlimitedAi()));
    }

    private static UserDto toDto(User user) {
        return new UserDto(user.getId(), user.getUsername(), user.getName(), user.getFirebaseUid());
    }
}
