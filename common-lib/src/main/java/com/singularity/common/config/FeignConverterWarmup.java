package com.singularity.common.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.cloud.openfeign.FeignClientFactory;
import org.springframework.cloud.openfeign.support.FeignHttpMessageConverters;

/**
 * Builds every Feign client's response decoder at startup, one after another, before any request arrives.
 *
 * <p>Handles: walking the Feign clients a service declares and asking each for its message converters once, on the
 * startup thread, and carrying on if one of them cannot be built - the client will then build it on first use, as it
 * would have without this.
 *
 * <p>The Feign library in use builds that list lazily and without a lock: it publishes an empty list and then fills
 * it. Two requests decoding a response at the same moment for the first time - which is what a page load does, since
 * session authentication itself calls account-service through Feign - can see the list while it is still empty, and
 * the one that does fails with "'messageConverters' must not be empty", a 500 on the first requests after every
 * restart. Building the list here, before the server accepts traffic, removes the moment that can go wrong. The
 * library's next patch release builds the list safely; this stays harmless when the build moves to it.
 *
 * <p>Not a component: registered by CommonLibAutoConfiguration, like every bean in this module. A service with no
 * Feign clients has no factory to walk and this does nothing.
 */
@Slf4j
@RequiredArgsConstructor
public class FeignConverterWarmup implements SmartInitializingSingleton {

    private static final String DEFAULT_CONFIGURATION_PREFIX = "default.";

    private final ObjectProvider<FeignClientFactory> feignClientFactory;

    @Override
    public void afterSingletonsInstantiated() {
        FeignClientFactory factory = feignClientFactory.getIfAvailable();
        if (factory == null) {
            return;
        }
        for (String client : factory.getConfigurations().keySet()) {
            if (client.startsWith(DEFAULT_CONFIGURATION_PREFIX)) {
                continue;
            }
            try {
                FeignHttpMessageConverters converters = factory.getInstance(client, FeignHttpMessageConverters.class);
                if (converters != null) {
                    converters.getConverters();
                }
            } catch (RuntimeException e) {
                log.warn("Couldn't prepare the Feign client '{}' ahead of its first call", client, e);
            }
        }
    }
}
