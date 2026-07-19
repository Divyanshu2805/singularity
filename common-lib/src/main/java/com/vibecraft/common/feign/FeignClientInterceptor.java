package com.vibecraft.common.feign;

import com.vibecraft.common.jwt.InternalJwtContext;
import com.vibecraft.common.jwt.InternalServiceAuthFilter;
import feign.RequestInterceptor;
import feign.RequestTemplate;

/**
 * Authenticates a service's outbound Feign calls to a sibling service.
 *
 * <p>Two independent things ride along:
 * <ul>
 *   <li><b>The shared internal-service secret</b>, on calls to a sibling's {@code /internal/**} API. That is the
 *       <em>only</em> thing {@link InternalServiceAuthFilter} accepts there - it deliberately does not accept an
 *       end-user JWT, since those endpoints return cross-tenant data. Every Feign client in this codebase calls
 *       {@code /internal/v1/**}, so without this header every cross-service call is a 401. That is not
 *       hypothetical: it shipped that way through Phases 1-3 (each internal endpoint was only ever exercised with
 *       {@code curl} and the secret), and the first signed-in request after the Phase 4 cutover failed on it.
 *       Kept to {@code /internal/} paths so the secret can never be sent to anything else a client might one day
 *       call. <b>Don't put a {@code path = "..."} prefix on an internal {@code @FeignClient}</b>: interceptors see
 *       the request before that prefix is applied, so the path check would miss it (the failure is a loud 401).</li>
 *   <li><b>The current request's internal JWT</b> (set by {@code JwtAuthFilter}), if there is one - what lets a
 *       service call a sibling "as" the logged-in user. Today the Gateway is a passthrough and mints none, so this
 *       is usually absent; it is kept for when it isn't.</li>
 * </ul>
 */
public class FeignClientInterceptor implements RequestInterceptor {

    private static final String INTERNAL_PATH_PREFIX = "/internal/";

    private final String sharedSecret;

    public FeignClientInterceptor(String sharedSecret) {
        this.sharedSecret = sharedSecret;
    }

    @Override
    public void apply(RequestTemplate template) {
        String token = InternalJwtContext.get();
        if (token != null) {
            template.header("Authorization", "Bearer " + token);
        }
        if (template.path().startsWith(INTERNAL_PATH_PREFIX)) {
            template.header(InternalServiceAuthFilter.HEADER, sharedSecret);
        }
    }
}
