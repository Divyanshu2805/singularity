package com.vibecraft.account.controller;

import com.vibecraft.account.entity.Plan;
import com.vibecraft.account.entity.User;
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
    private final SubscriptionService subscriptionService;

    @GetMapping("/users/{userId}")
    public UserDto getUser(@PathVariable Long userId) {
        return toDto(userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString())));
    }

    /** Used by workspace-service's invite-by-email flow (ProjectMemberService) once it's extracted. */
    @GetMapping("/users/by-username")
    public UserDto getUserByUsername(@RequestParam String username) {
        return toDto(userRepository.findByUsername(username)
                .orElseThrow(() -> new ResourceNotFoundException("User", username)));
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
