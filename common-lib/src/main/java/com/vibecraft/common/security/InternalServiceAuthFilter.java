package com.vibecraft.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Machine-to-machine authentication for /internal/v1/**.
 *
 * <p>Handles: reading the shared secret off X-Internal-Service-Token, comparing it in constant time, and - only on a
 * match - authenticating the caller as the internal-service principal carrying the ROLE authority. It authenticates
 * nobody otherwise and never rejects a request itself; each service's chain requires ROLE on /internal/**, so a
 * caller without the secret is denied there and unaffected everywhere else.
 *
 * <p>The distinct authority is the point. These endpoints take an arbitrary user id or project id and answer without
 * an ownership check, so a signed-in end user's session cookie must not satisfy them; requiring this authority rather
 * than merely "authenticated" is what keeps a browser session out.
 */
public class InternalServiceAuthFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Service-Token";

    public static final String ROLE = "ROLE_INTERNAL_SERVICE";

    public static final String PATH_PREFIX = "/internal/";

    private final String expectedToken;

    public InternalServiceAuthFilter(String expectedToken) {
        this.expectedToken = expectedToken;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        if (presented != null && constantTimeEquals(presented, expectedToken)) {
            var authentication = new UsernamePasswordAuthenticationToken(
                    "internal-service", null, List.of(new SimpleGrantedAuthority(ROLE)));
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
