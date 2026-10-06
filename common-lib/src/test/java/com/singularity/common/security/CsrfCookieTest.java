package com.singularity.common.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins the attributes a browser needs before it will accept the CSRF cookie under the __Host- prefix: Secure, Path=/,
 * no Domain, and script-readable so the frontend can echo it. The request is plain http, the way the Gateway
 * delivers it, because that is the case where the repository would otherwise leave Secure off.
 */
class CsrfCookieTest {

    @Test
    @DisplayName("the token cookie carries the __Host- prefix with Secure, Path=/ and no Domain, even on a plain-http hop")
    void cookieSatisfiesTheHostPrefix() {
        CookieCsrfTokenRepository repository = CsrfCookie.repository();
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        CsrfToken token = repository.generateToken(request);
        repository.saveToken(token, request, response);

        String setCookie = response.getHeader("Set-Cookie");
        assertThat(setCookie).startsWith("__Host-XSRF-TOKEN=" + token.getToken());
        assertThat(setCookie).contains("Secure").contains("Path=/").doesNotContain("Domain=").doesNotContain("HttpOnly");
    }
}
