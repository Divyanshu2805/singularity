package com.singularity.common.security;

import org.springframework.security.web.csrf.CookieCsrfTokenRepository;

/**
 * The CSRF token cookie's one definition.
 *
 * <p>Handles: the repository every browser-facing security chain hands to csrf().spa(), so the token cookie is named,
 * scoped and flagged the same way in every service.
 *
 * <p>The __Host- prefix is the point. Live previews are served from a sibling subdomain of the app, and a page there
 * can set a cookie for the shared parent domain; a browser refuses to accept a __Host- cookie from anywhere but this
 * exact host, over a secure connection, with Path=/ and no Domain, so a preview page cannot plant a token of its own.
 * The prefix requires the Secure attribute, which the repository would otherwise set only for a request it sees as
 * https - behind the Gateway it does not - so Secure is forced here. The frontend reads the cookie by this name
 * (frontend/src/lib/csrf.ts); the two must change together.
 */
public final class CsrfCookie {

    public static final String NAME = "__Host-XSRF-TOKEN";

    private CsrfCookie() {
    }

    public static CookieCsrfTokenRepository repository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieName(NAME);
        repository.setCookieCustomizer(cookie -> cookie.secure(true).path("/"));
        return repository;
    }
}
