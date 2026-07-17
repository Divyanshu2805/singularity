package com.vibecraft.common.jwt;

/**
 * Carries the raw internal-JWT string from {@code JwtAuthFilter} (which verified it off the inbound
 * request) to {@code FeignClientInterceptor} (which forwards the same token, unmodified, on any outbound
 * call that request triggers) — request-scoped via a ThreadLocal since Feign calls happen synchronously on
 * the same thread that's handling the inbound request.
 */
public final class InternalJwtContext {

    private static final ThreadLocal<String> CURRENT_TOKEN = new ThreadLocal<>();

    private InternalJwtContext() {
    }

    public static void set(String rawToken) {
        CURRENT_TOKEN.set(rawToken);
    }

    public static String get() {
        return CURRENT_TOKEN.get();
    }

    public static void clear() {
        CURRENT_TOKEN.remove();
    }
}
