package com.java.vibecraft.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.io.IOException;
import java.util.Optional;

/**
 * Authenticates a request from its Firebase-backed session cookie.
 *
 * <p>Deliberately not a {@code @Component}: Spring Boot registers every Filter bean as a servlet filter as well, so it
 * would run a second time outside the security chain. {@code WebSecurityConfig} constructs it.
 *
 * <p>A cookie that no longer works is cleared and the request simply continues unauthenticated - so a stale cookie
 * never stands between someone and the sign-in endpoint. Protected endpoints then answer 401.
 */
public class SessionAuthFilter extends OncePerRequestFilter {

    private final SessionAuthenticator sessionAuthenticator;
    private final SessionCookies sessionCookies;
    private final HandlerExceptionResolver handlerExceptionResolver;

    public SessionAuthFilter(SessionAuthenticator sessionAuthenticator, SessionCookies sessionCookies,
                             HandlerExceptionResolver handlerExceptionResolver) {
        this.sessionAuthenticator = sessionAuthenticator;
        this.sessionCookies = sessionCookies;
        this.handlerExceptionResolver = handlerExceptionResolver;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        try {
            if (SecurityContextHolder.getContext().getAuthentication() == null) {
                authenticate(request, response);
            }
        } catch (Exception ex) {
            // Firebase unreachable... Resolved to an ApiError like every other failure.
            handlerExceptionResolver.resolveException(request, response, null, ex);
            return;
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(HttpServletRequest request, HttpServletResponse response) {
        Optional<String> cookie = sessionCookies.read(request);
        if (cookie.isPresent()) {
            Optional<UserPrincipal> principal = sessionAuthenticator.authenticate(cookie.get());
            if (principal.isPresent()) {
                setAuthentication(principal.get());
            } else {
                sessionCookies.clear(response);
            }
        }
    }

    private static void setAuthentication(UserPrincipal principal) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.authorities()));
    }
}
