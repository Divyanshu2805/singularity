package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Where live previews run and how they are reached.
 *
 * <p>Handles: the Kubernetes namespace holding the runner pool, the scheme, domain and port previews are served on,
 * the port Vite listens on inside a runner, the storage alias and bucket the syncer mirrors from, the four
 * timeouts that bound a preview's life - idle, boot, the proxy route's expiry in Redis, and the access token's
 * lifetime - and the secret that signs that token.
 *
 * <p>The public domain is localhost in development because browsers resolve any *.localhost name to the loopback
 * address with no hosts-file edits. The route TTL is what makes a route the backend forgot about - because it crashed
 * - disappear on its own. accessTokenSecret must match proxy/index.js's PREVIEW_ACCESS_TOKEN_SECRET exactly - it is
 * how the proxy verifies a viewer without either service holding a session store the other can read.
 */
@ConfigurationProperties(prefix = "preview")
public record PreviewProperties(
        String namespace,
        String publicScheme,
        String publicDomain,
        Integer publicPort,
        int runnerPort,
        String storageAlias,
        String bucket,
        Duration idleTimeout,
        Duration bootTimeout,
        Duration routeTtl,
        String accessTokenSecret,
        Duration accessTokenTtl
) {

    public String urlFor(String hostname) {
        boolean defaultPort = publicPort == null
                || (publicPort == 80 && "http".equals(publicScheme))
                || (publicPort == 443 && "https".equals(publicScheme));
        return publicScheme + "://" + hostname + (defaultPort ? "" : ":" + publicPort) + "/";
    }
}
