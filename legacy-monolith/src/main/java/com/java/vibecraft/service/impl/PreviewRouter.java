package com.java.vibecraft.service.impl;

import com.java.vibecraft.config.PreviewProperties;
import com.java.vibecraft.error.ExternalServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

/**
 * The routing table the preview proxy ({@code proxy/index.js}) reads: {@code route:<hostname>} holds the runner's
 * {@code podIp:port}. The proxy writes {@code seen:<hostname>} (epoch millis) as people load the preview, which is
 * how a preview open in its own tab - with the app closed - still counts as in use.
 *
 * <p>Keep these key names in step with the proxy; nothing else ties the two together.
 */
@Component
@RequiredArgsConstructor
public class PreviewRouter {

    private static final String ROUTE_PREFIX = "route:";
    private static final String SEEN_PREFIX = "seen:";

    private final StringRedisTemplate redisTemplate;
    private final PreviewProperties properties;

    public void register(String hostname, String podIp) {
        try {
            redisTemplate.opsForValue().set(ROUTE_PREFIX + hostname, podIp + ":" + properties.runnerPort(),
                    properties.routeTtl());
        } catch (DataAccessException e) {
            throw routerUnreachable(e);
        }
    }

    public void refresh(String hostname) {
        try {
            redisTemplate.expire(ROUTE_PREFIX + hostname, properties.routeTtl());
        } catch (DataAccessException e) {
            throw routerUnreachable(e);
        }
    }

    public void remove(String hostname) {
        if (hostname == null) return;
        try {
            redisTemplate.delete(ROUTE_PREFIX + hostname);
        } catch (DataAccessException e) {
            throw routerUnreachable(e);
        }
    }

    /** The last time the proxy served this hostname, if it has since the key last expired. */
    public Optional<Instant> lastVisit(String hostname) {
        try {
            String millis = redisTemplate.opsForValue().get(SEEN_PREFIX + hostname);
            return millis == null ? Optional.empty() : Optional.of(Instant.ofEpochMilli(Long.parseLong(millis)));
        } catch (NumberFormatException e) {
            return Optional.empty();
        } catch (DataAccessException e) {
            throw routerUnreachable(e);
        }
    }

    private static ExternalServiceException routerUnreachable(DataAccessException e) {
        return new ExternalServiceException("Couldn't reach the preview router (Redis)", e);
    }
}
