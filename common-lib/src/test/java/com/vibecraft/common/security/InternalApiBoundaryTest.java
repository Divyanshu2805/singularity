package com.vibecraft.common.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authorization.AuthorityAuthorizationManager;
import org.springframework.security.authorization.AuthorizationManager;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.access.intercept.RequestAuthorizationContext;

import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Runs SessionAuthFilter and InternalServiceAuthFilter back to back the way ServiceSecurityConfig and account's
 * WebSecurityConfig chain them, then checks the resulting SecurityContext against the same
 * {@code hasAuthority(InternalServiceAuthFilter.ROLE)} decision both chains apply to /internal/**.
 *
 * <p>This is CODE_REVIEW.md SEC-01/SEC-02's "full filter-chain test": it exists to pin, at the filter level rather
 * than by reading the config, that a valid end-user session cookie - with or without an incorrect internal-service
 * header - never satisfies the internal-service authority, and that only the correct shared secret does. Not a
 * {@code @SpringBootTest}: both filters are plain OncePerRequestFilters, constructed directly, so this needs no
 * servlet container, security auto-configuration or database.
 */
class InternalApiBoundaryTest {

    private static final String CORRECT_SECRET = "correct-horse-battery-staple";
    private static final String WRONG_SECRET = "guessed-secret";
    private static final AuthorizationManager<RequestAuthorizationContext> INTERNAL_ONLY =
            AuthorityAuthorizationManager.hasAuthority(InternalServiceAuthFilter.ROLE);

    private final SessionAuthenticator sessionAuthenticator = mock(SessionAuthenticator.class);
    private final AuthProperties authProperties =
            new AuthProperties(new AuthProperties.SessionCookie("session", Duration.ofDays(1), true), Duration.ofMinutes(5));
    private final SessionCookies sessionCookies = new SessionCookies(authProperties);
    private final SessionAuthFilter sessionAuthFilter =
            new SessionAuthFilter(sessionAuthenticator, sessionCookies, (request, response, handler, ex) -> {
                throw new RuntimeException("unexpected filter failure", ex);
            });
    private final InternalServiceAuthFilter internalServiceAuthFilter = new InternalServiceAuthFilter(CORRECT_SECRET);

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void noCookieAndNoHeaderLeavesTheRequestUnauthenticated() throws Exception {
        runChain(request());

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertDenied();
    }

    @Test
    void aValidSessionCookieAloneDoesNotSatisfyTheInternalAuthority() throws Exception {
        UserPrincipal user = new UserPrincipal(42L, "user@example.com", "firebase-uid", List.of());
        when(sessionAuthenticator.authenticate("valid-cookie")).thenReturn(Optional.of(user));

        runChain(requestWithCookie("valid-cookie"));

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertTrue(authentication.isAuthenticated());
        assertTrue(authentication.getAuthorities().isEmpty());
        assertDenied();
    }

    @Test
    void aValidCookiePlusAnIncorrectSharedSecretIsStillDenied() throws Exception {
        UserPrincipal user = new UserPrincipal(42L, "user@example.com", "firebase-uid", List.of());
        when(sessionAuthenticator.authenticate("valid-cookie")).thenReturn(Optional.of(user));

        MockHttpServletRequest request = requestWithCookie("valid-cookie");
        request.addHeader(InternalServiceAuthFilter.HEADER, WRONG_SECRET);
        runChain(request);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertTrue(authentication.isAuthenticated());
        assertTrue(authentication.getAuthorities().isEmpty());
        assertDenied();
    }

    @Test
    void onlyTheCorrectSharedSecretGrantsTheInternalAuthority() throws Exception {
        MockHttpServletRequest request = request();
        request.addHeader(InternalServiceAuthFilter.HEADER, CORRECT_SECRET);
        runChain(request);

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        assertTrue(authentication.isAuthenticated());
        assertTrue(authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals(InternalServiceAuthFilter.ROLE)));
        assertGranted();
    }

    @Test
    void aBearerAuthorizationHeaderIsNotAnAlternatePathToTheInternalAuthority() throws Exception {
        MockHttpServletRequest request = request();
        request.addHeader("Authorization", "Bearer " + CORRECT_SECRET);
        runChain(request);

        assertNull(SecurityContextHolder.getContext().getAuthentication());
        assertDenied();
    }

    private void runChain(MockHttpServletRequest request) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain terminal = (req, res) -> { };
        sessionAuthFilter.doFilter(request, response, (req, res) ->
                internalServiceAuthFilter.doFilter(req, res, terminal));
    }

    private static MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/internal/v1/projects/7/members/3");
        request.setServletPath("/internal/v1/projects/7/members/3");
        return request;
    }

    private static MockHttpServletRequest requestWithCookie(String value) {
        MockHttpServletRequest request = request();
        request.setCookies(new jakarta.servlet.http.Cookie("session", value));
        return request;
    }

    private static void assertDenied() {
        assertFalse(isGranted(), "expected the internal-service authority to be denied");
    }

    private static void assertGranted() {
        assertTrue(isGranted(), "expected the internal-service authority to be granted");
    }

    private static boolean isGranted() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        Supplier<Authentication> supplier = () -> authentication;
        AuthorizationResult result = INTERNAL_ONLY.authorize(supplier, new RequestAuthorizationContext(request()));
        return result != null && result.isGranted();
    }
}
