package com.vibecraft.common.feign;

import com.vibecraft.common.jwt.InternalJwtContext;
import com.vibecraft.common.jwt.InternalServiceAuthFilter;
import feign.Request;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collection;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The gap that shipped through Phases 1-3 and failed on the first signed-in request after the Phase 4 cutover:
 * the caller side (this interceptor) never sent the secret the callee side ({@link InternalServiceAuthFilter})
 * requires, so every Feign call between services was a 401. Each side had been exercised alone - the endpoints
 * with {@code curl} plus the secret - and never the two together. {@link #whatTheInterceptorSendsIsWhatTheGuardAccepts}
 * is the test that joins them.
 */
class FeignClientInterceptorTest {

    private static final String SECRET = "test-shared-secret";

    private final FeignClientInterceptor interceptor = new FeignClientInterceptor(SECRET);

    @AfterEach
    void clean() {
        InternalJwtContext.clear();
        SecurityContextHolder.clearContext();
    }

    private static RequestTemplate get(String uri) {
        return new RequestTemplate().method(Request.HttpMethod.GET).uri(uri);
    }

    private static Collection<String> header(RequestTemplate template, String name) {
        return template.headers().get(name);
    }

    @Test
    @DisplayName("a call to a sibling's /internal/** API carries the shared secret")
    void internalCallCarriesTheSecret() {
        RequestTemplate template = get("/internal/v1/sessions/revoked?cookieHash=abc");

        interceptor.apply(template);

        assertThat(header(template, InternalServiceAuthFilter.HEADER)).containsExactly(SECRET);
    }

    @Test
    @DisplayName("the secret is never sent on a call that isn't to /internal/**")
    void neverLeaksTheSecretElsewhere() {
        for (String uri : new String[]{"/api/plans", "/", "/v1/internal/users/1", "/internalx/v1"}) {
            RequestTemplate template = get(uri);

            interceptor.apply(template);

            assertThat(header(template, InternalServiceAuthFilter.HEADER)).as(uri).isNull();
        }
    }

    @Test
    @DisplayName("still forwards the current request's internal JWT when there is one")
    void stillForwardsTheJwt() {
        InternalJwtContext.set("jwt-abc");
        RequestTemplate template = get("/internal/v1/users/1");

        interceptor.apply(template);

        assertThat(header(template, "Authorization")).containsExactly("Bearer jwt-abc");
        assertThat(header(template, InternalServiceAuthFilter.HEADER)).containsExactly(SECRET);
    }

    @Test
    @DisplayName("sends no Authorization header when there is no JWT in context (the usual case today)")
    void noJwtNoAuthorizationHeader() {
        RequestTemplate template = get("/internal/v1/users/1");

        interceptor.apply(template);

        assertThat(header(template, "Authorization")).isNull();
    }

    @Test
    @DisplayName("what the interceptor sends is what the guard accepts (the two sides, together)")
    void whatTheInterceptorSendsIsWhatTheGuardAccepts() throws Exception {
        RequestTemplate template = get("/internal/v1/sessions/revoked?cookieHash=abc");
        interceptor.apply(template);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/internal/v1/sessions/revoked");
        header(template, InternalServiceAuthFilter.HEADER).forEach(v -> request.addHeader(InternalServiceAuthFilter.HEADER, v));

        new InternalServiceAuthFilter(SECRET).doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication())
                .as("the guard should have authenticated the interceptor's request")
                .isNotNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication().isAuthenticated()).isTrue();
    }

    @Test
    @DisplayName("...and a caller configured with a different secret is not authenticated")
    void aWrongSecretIsRejected() throws Exception {
        RequestTemplate template = get("/internal/v1/users/1");
        new FeignClientInterceptor("some-other-secret").apply(template);

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/internal/v1/users/1");
        header(template, InternalServiceAuthFilter.HEADER).forEach(v -> request.addHeader(InternalServiceAuthFilter.HEADER, v));

        new InternalServiceAuthFilter(SECRET).doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }
}
