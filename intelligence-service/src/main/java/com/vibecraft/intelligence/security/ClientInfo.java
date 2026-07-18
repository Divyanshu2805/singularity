package com.vibecraft.intelligence.security;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Who is on the other end of a request, for rate limiting and the audit trail.
 *
 * <p>Uses {@code getRemoteAddr()} and never reads {@code X-Forwarded-For} itself: that header is whatever the client
 * says it is. Behind a real reverse proxy, set {@code server.forward-headers-strategy: native} so Spring rewrites the
 * remote address from the proxy's headers - and only then.
 */
public record ClientInfo(String ipAddress, String userAgent) {

    private static final int MAX_USER_AGENT = 255;

    public static ClientInfo from(HttpServletRequest request) {
        String userAgent = request.getHeader("User-Agent");
        if (userAgent != null && userAgent.length() > MAX_USER_AGENT) userAgent = userAgent.substring(0, MAX_USER_AGENT);
        return new ClientInfo(request.getRemoteAddr(), userAgent);
    }
}
