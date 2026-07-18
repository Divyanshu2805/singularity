package com.vibecraft.account.security;

import com.vibecraft.common.error.RateLimitExceededException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Applies {@link RateLimiter} after authentication, so signed-in traffic is limited per user and anonymous traffic
 * per IP. Every applicable rule must pass. Not a {@code @Component}, for the same reason as {@link SessionAuthFilter}.
 */
public class RateLimitFilter extends OncePerRequestFilter {

    /** Sign-in and account recovery, per IP: the credential-stuffing and inbox-flooding surface. */
    static final RateLimiter.Rule AUTH = new RateLimiter.Rule("auth", 10, Duration.ofMinutes(1));

    /** Everything else under /api: generous for a person clicking around, tight for a script. */
    static final RateLimiter.Rule API = new RateLimiter.Rule("api", 600, Duration.ofMinutes(1));

    private static final Set<String> AUTH_PATHS = Set.of("/api/auth/session");

    private final RateLimiter rateLimiter;
    private final HandlerExceptionResolver handlerExceptionResolver;

    public RateLimitFilter(RateLimiter rateLimiter, HandlerExceptionResolver handlerExceptionResolver) {
        this.rateLimiter = rateLimiter;
        this.handlerExceptionResolver = handlerExceptionResolver;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Only the API. Stripe's webhook in particular is left alone: Stripe retries and signs it, and throttling it
        // would only lose billing events.
        return !request.getRequestURI().startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String ip = request.getRemoteAddr();
        String caller = currentUserKey().orElse("ip:" + ip);

        for (RuleAndKey applicable : rulesFor(request.getMethod(), request.getRequestURI(), ip, caller)) {
            long retryAfter = rateLimiter.tryAcquire(applicable.rule(), applicable.key());
            if (retryAfter > 0) {
                handlerExceptionResolver.resolveException(request, response, null, new RateLimitExceededException(retryAfter));
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    record RuleAndKey(RateLimiter.Rule rule, String key) {
    }

    static List<RuleAndKey> rulesFor(String method, String path, String ip, String caller) {
        List<RuleAndKey> rules = new ArrayList<>(2);
        boolean isPost = "POST".equals(method);
        if (isPost && AUTH_PATHS.contains(path)) rules.add(new RuleAndKey(AUTH, "ip:" + ip));
        rules.add(new RuleAndKey(API, caller));
        return rules;
    }

    private static Optional<String> currentUserKey() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof UserPrincipal principal) {
            return Optional.of("user:" + principal.userId());
        }
        return Optional.empty();
    }
}
