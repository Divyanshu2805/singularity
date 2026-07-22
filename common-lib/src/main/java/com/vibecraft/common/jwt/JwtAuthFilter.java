package com.vibecraft.common.jwt;

import io.jsonwebtoken.JwtException;
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
 * Authenticates a service's request using an internal JWT (see {@link InternalJwtService} - nothing attaches one
 * on a live request path today, and no service's security chain inserts this filter). Not auto-registered as a
 * blanket servlet filter: each service's own Spring Security chain would decide where to insert it (before
 * {@code UsernamePasswordAuthenticationFilter}), since public routes (health checks, internal-service
 * endpoints authenticated a different way) shouldn't go through it at all.
 */
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final InternalJwtService jwtService;

    public JwtAuthFilter(InternalJwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String rawToken = header.substring(BEARER_PREFIX.length());
            try {
                InternalJwtClaims claims = jwtService.verify(rawToken);
                var authentication = new UsernamePasswordAuthenticationToken(claims, null, List.of());
                SecurityContextHolder.getContext().setAuthentication(authentication);
                InternalJwtContext.set(rawToken);
            } catch (JwtException | IllegalArgumentException ignored) {
                // Falls through unauthenticated — downstream @PreAuthorize/permitAll decides what happens next.
            }
        }
        try {
            filterChain.doFilter(request, response);
        } finally {
            InternalJwtContext.clear();
        }
    }
}
