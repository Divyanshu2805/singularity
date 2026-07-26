package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.common.error.ExternalServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Optional;

/**
 * The routing table the preview proxy reads.
 *
 * <p>Handles: publishing a preview's hostname to its runner's address with an expiry, pushing that expiry back while
 * the preview is in use, removing it, and reading back the last time the proxy served that hostname.
 *
 * <p>Refreshing reports whether there was a route to refresh at all: a lost key - Redis restarted, or evicted it -
 * must be re-registered, since extending the expiry of a key that does not exist would silently leave a running
 * preview unroutable for good.
 *
 * <p>The proxy also writes the last-seen key itself as people load a preview, which is how a preview open in its own
 * tab, with the app closed, still counts as in use. Keep these key names in step with the proxy; nothing else ties
 * the two together.
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

    public boolean refresh(String hostname) {
        try {
            return Boolean.TRUE.equals(redisTemplate.expire(ROUTE_PREFIX + hostname, properties.routeTtl()));
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
