package com.vibecraft.common.feign;

import com.vibecraft.common.jwt.InternalJwtContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;

/**
 * Forwards the current request's internal JWT (set by {@code JwtAuthFilter}) onto any outbound Feign call
 * it makes — this is what lets, e.g., intelligence-service call workspace-service "as" the logged-in user
 * without either side re-authenticating anything.
 */
public class FeignClientInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        String token = InternalJwtContext.get();
        if (token != null) {
            template.header("Authorization", "Bearer " + token);
        }
    }
}
