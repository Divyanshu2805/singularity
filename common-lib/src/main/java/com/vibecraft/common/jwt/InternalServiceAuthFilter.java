package com.vibecraft.common.jwt;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Guards {@code /internal/v1/**}: these endpoints return cross-tenant data by design (e.g. "does user X
 * have a role on project Y" for an arbitrary X), so a valid end-user internal JWT is deliberately NOT
 * enough to call them — see the migration plan's design decision on internal-API credentials. Requires a
 * distinct shared secret on {@code X-Internal-Service-Token}, checked with a constant-time comparison.
 * Upgradeable to mTLS/service identity later; a static shared secret is enough for this migration.
 */
public class InternalServiceAuthFilter extends OncePerRequestFilter {

    private static final String HEADER = "X-Internal-Service-Token";

    private final String expectedToken;

    public InternalServiceAuthFilter(String expectedToken) {
        this.expectedToken = expectedToken;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        if (presented != null && constantTimeEquals(presented, expectedToken)) {
            var authentication = new UsernamePasswordAuthenticationToken("internal-service", null, List.of());
            SecurityContextHolder.getContext().setAuthentication(authentication);
        }
        filterChain.doFilter(request, response);
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
