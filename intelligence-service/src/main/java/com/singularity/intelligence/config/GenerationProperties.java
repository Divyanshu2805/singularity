package com.singularity.intelligence.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The limits a build turn runs inside.
 *
 * <p>Handles: how long the model may go silent before its call is abandoned, how long one call and one whole turn may
 * take, how long to wait before asking a rate-limited provider again, and how many times a turn may ask the model to
 * carry on an unfinished reply or to repair imports that do not resolve.
 *
 * <p>The silence limit is the one that matters most. A provider can accept a request and then send nothing - no
 * tokens, no error - and with no limit the turn waited on it indefinitely, holding the project's one generation slot
 * the whole time. It is generous because a reasoning model can think for a minute or more before its first token, and
 * a reply the turn gives up on is paid for anyway.
 *
 * <p>Every value has a default, so a deployment that sets none of them behaves sensibly.
 */
@ConfigurationProperties(prefix = "generation")
public record GenerationProperties(
        Duration idleTimeout,
        Duration attemptTimeout,
        Duration turnTimeout,
        Duration busyPause,
        Integer maxContinuations,
        Integer maxRepairs
) {

    public GenerationProperties {
        idleTimeout = idleTimeout == null ? Duration.ofMinutes(3) : idleTimeout;
        attemptTimeout = attemptTimeout == null ? Duration.ofMinutes(10) : attemptTimeout;
        turnTimeout = turnTimeout == null ? Duration.ofMinutes(20) : turnTimeout;
        busyPause = busyPause == null ? Duration.ofSeconds(4) : busyPause;
        maxContinuations = maxContinuations == null ? 2 : maxContinuations;
        maxRepairs = maxRepairs == null ? 3 : maxRepairs;
    }

    public static GenerationProperties defaults() {
        return new GenerationProperties(null, null, null, null, null, null);
    }
}
