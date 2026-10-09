package com.singularity.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.Map;

/**
 * Where published apps are served, how many one owner may have, and the bounds around making one.
 *
 * <p>Handles: the scheme, domain and port a published app's link is built from, the bucket the builds are stored in,
 * the number of live apps each plan allows, how often one project and one person may start a build, the waits for a
 * runner and for each build step, the limits on the sources that go in and the files that come out, how long a retired
 * build is kept before it is deleted, and how stale a build's heartbeat may be before the sweeper calls it abandoned.
 *
 * <p>The public domain is its own setting rather than the preview domain, even where the two are equal today (one
 * wildcard certificate covers a single level on the production domain): moving published apps to a registered domain
 * of their own is then a configuration change. The proxy reads the same value as PUBLISHED_DOMAIN. The plan limits are
 * keyed by plan name because account-service's plan table has no column for them; a plan with no entry gets
 * {@code defaultLimit}.
 */
@ConfigurationProperties(prefix = "publishing")
public record PublishingProperties(
        String publicScheme,
        String publicDomain,
        Integer publicPort,
        String bucket,
        Map<String, Integer> planLimits,
        int defaultLimit,
        int maxBuildsPerHour,
        Duration minBuildInterval,
        Duration runnerWait,
        Duration installTimeout,
        Duration buildTimeout,
        Duration collectTimeout,
        int maxSourceFiles,
        long maxSourceBytes,
        int maxOutputFiles,
        long maxOutputBytes,
        Duration retireAfter,
        Duration heartbeatStaleAfter,
        int logMaxChars
) {

    public String urlFor(String slug) {
        boolean defaultPort = publicPort == null
                || (publicPort == 80 && "http".equals(publicScheme))
                || (publicPort == 443 && "https".equals(publicScheme));
        return publicScheme + "://" + slug + "." + publicDomain + (defaultPort ? "" : ":" + publicPort) + "/";
    }

    public int limitFor(String planName) {
        if (planLimits == null || planName == null) return defaultLimit;
        return planLimits.getOrDefault(planName, defaultLimit);
    }
}
