package com.vibecraft.common.feign;

import com.vibecraft.common.security.InternalServiceAuthFilter;
import feign.RequestInterceptor;
import feign.RequestTemplate;

/**
 * Authenticates this service's outbound Feign calls to a sibling service.
 *
 * <p>Handles: attaching the shared internal-service secret to any request whose path starts with /internal/, which is
 * the only credential InternalServiceAuthFilter accepts there. Every Feign client in this codebase calls
 * /internal/v1/**, so without this header every cross-service call is a 401 - which once shipped, because each side
 * had only ever been exercised on its own.
 *
 * <p>The path check is why an internal @FeignClient must not declare a path prefix, and scoping the header to
 * /internal/ paths is what keeps the secret from being sent anywhere else.
 */
public class FeignClientInterceptor implements RequestInterceptor {

    private final String sharedSecret;

    public FeignClientInterceptor(String sharedSecret) {
        this.sharedSecret = sharedSecret;
    }

    @Override
    public void apply(RequestTemplate template) {
        if (template.path().startsWith(InternalServiceAuthFilter.PATH_PREFIX)) {
            template.header(InternalServiceAuthFilter.HEADER, sharedSecret);
        }
    }
}
