package com.singularity.common.security;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.web.header.HeaderWriter;
import org.springframework.security.web.header.HeaderWriterFilter;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the security headers are on the response before the request is handled, and are written once.
 *
 * <p>Handles: a filter set up the way every chain here sets it up having written its headers by the time the handler
 * runs, and not writing them again when the chain returns; and, for contrast, Spring Security's default writing
 * nothing until afterwards - which is the moment a streamed response's own thread is already using the response.
 *
 * <p>The failure this prevents needs two threads and a real servlet container to happen, so it cannot be staged in a
 * unit test. What can be pinned is its cause: who writes the headers, and when.
 */
class EagerSecurityHeadersTest {

    private final AtomicInteger writes = new AtomicInteger();
    private final HeaderWriter writer = (request, response) -> {
        writes.incrementAndGet();
        response.setHeader("X-Test-Policy", "on");
    };

    private String headerSeenByTheHandler(HeaderWriterFilter filter) throws Exception {
        AtomicReference<String> seen = new AtomicReference<>();
        MockHttpServletResponse response = new MockHttpServletResponse();
        FilterChain handler = (request, sameResponse) -> seen.set(response.getHeader("X-Test-Policy"));
        filter.doFilter(new MockHttpServletRequest("POST", "/api/chat/stream"), response, handler);
        assertThat(response.getHeader("X-Test-Policy")).isEqualTo("on");
        return seen.get();
    }

    @Test
    void theHeadersAreAlreadyThereWhenTheHandlerRunsAndAreWrittenOnce() throws Exception {
        HeaderWriterFilter filter = EagerSecurityHeaders.beforeTheResponse()
                .postProcess(new HeaderWriterFilter(List.of(writer)));

        assertThat(headerSeenByTheHandler(filter)).isEqualTo("on");
        assertThat(writes).hasValue(1);
    }

    @Test
    void leftAsSpringSecurityShipsItTheHeadersAreWrittenOnlyAfterTheHandlerReturns() throws Exception {
        assertThat(headerSeenByTheHandler(new HeaderWriterFilter(List.of(writer)))).isNull();
    }
}
