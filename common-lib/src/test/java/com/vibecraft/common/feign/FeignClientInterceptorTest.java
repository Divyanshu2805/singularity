package com.vibecraft.common.feign;

import com.vibecraft.common.security.InternalServiceAuthFilter;
import feign.Request;
import feign.RequestTemplate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collection;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the two halves of service-to-service authentication against each other.
 *
 * <p>Covers: that the caller side sends the shared secret on exactly the paths the callee side requires it and never
 * anywhere else, that a wrong or missing secret leaves the request unauthenticated, and that an authenticated machine
 * caller carries InternalServiceAuthFilter.ROLE - the authority each service's chain requires on /internal/**, and
 * the reason an end user's session cookie cannot reach those endpoints.
 *
 * <p>This exists because the gap it covers once shipped: each side had only been exercised alone, with curl plus the
 * secret, so every Feign call between services was a 401 on the first signed-in request.
 */
class FeignClientInterceptorTest {

    private static final String SECRET = "test-shared-secret";

    private final FeignClientInterceptor interceptor = new FeignClientInterceptor(SECRET);

    @AfterEach
    void clean() {
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
    @DisplayName("no Authorization header is ever added - the secret is the only credential")
    void sendsNoBearerToken() {
        RequestTemplate template = get("/internal/v1/users/1");

        interceptor.apply(template);

        assertThat(header(template, "Authorization")).isNull();
    }

    @Test
    @DisplayName("what the interceptor sends is what the guard accepts, with the internal-service authority")
    void whatTheInterceptorSendsIsWhatTheGuardAccepts() throws Exception {
        RequestTemplate template = get("/internal/v1/sessions/revoked?cookieHash=abc");
        interceptor.apply(template);

        runGuard(template, "/internal/v1/sessions/revoked");

        var authentication = SecurityContextHolder.getContext().getAuthentication();
        assertThat(authentication).as("the guard should have authenticated the interceptor's request").isNotNull();
        assertThat(authentication.isAuthenticated()).isTrue();
        assertThat(authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority))
                .as("the authority each service's chain requires on /internal/**")
                .containsExactly(InternalServiceAuthFilter.ROLE);
    }

    @Test
    @DisplayName("...and a caller configured with a different secret is not authenticated")
    void aWrongSecretIsRejected() throws Exception {
        RequestTemplate template = get("/internal/v1/users/1");
        new FeignClientInterceptor("some-other-secret").apply(template);

        runGuard(template, "/internal/v1/users/1");

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    @DisplayName("a request with no secret at all is left unauthenticated, so the chain denies it")
    void noSecretIsNotAuthenticated() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/internal/v1/users/1");

        new InternalServiceAuthFilter(SECRET).doFilter(request, new MockHttpServletResponse(), new MockFilterChain());

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    private static void runGuard(RequestTemplate template, String path) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
        header(template, InternalServiceAuthFilter.HEADER)
                .forEach(value -> request.addHeader(InternalServiceAuthFilter.HEADER, value));

        new InternalServiceAuthFilter(SECRET).doFilter(request, new MockHttpServletResponse(), new MockFilterChain());
    }
}
