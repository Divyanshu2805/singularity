package com.singularity.common.security;

import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.web.header.HeaderWriterFilter;

/**
 * Makes a security chain write its response headers before the request is handled rather than after.
 *
 * <p>Handles: the one setting on Spring Security's HeaderWriterFilter, applied through the headers configurer of
 * every browser-facing chain (ServiceSecurityConfig and account-service's own).
 *
 * <p>By default the filter writes the headers when the chain returns, or when the response is committed, whichever
 * comes first. For a streamed response those are two different threads: the request thread leaves the chain while
 * the stream's own thread is already writing its first event, and both then touch the response's header table, which
 * is not built for that. Under eight builds started at the same moment one of them failed before it began - an
 * ArrayIndexOutOfBoundsException inside Tomcat's MimeHeaders, a 500 from the service, and the Gateway reporting
 * "Connection prematurely closed BEFORE response" for a build that never ran. Found by the load test (e2e/load.mjs)
 * on 2026-10-09.
 *
 * <p>Written first, the headers are set by the request thread alone, before any other thread has the response. Every
 * writer in use decides from the request, never from the response's status, so what is sent does not change.
 */
public final class EagerSecurityHeaders {

    private EagerSecurityHeaders() {
    }

    public static ObjectPostProcessor<HeaderWriterFilter> beforeTheResponse() {
        return new ObjectPostProcessor<>() {
            @Override
            public <O extends HeaderWriterFilter> O postProcess(O filter) {
                filter.setShouldWriteHeadersEagerly(true);
                return filter;
            }
        };
    }
}
