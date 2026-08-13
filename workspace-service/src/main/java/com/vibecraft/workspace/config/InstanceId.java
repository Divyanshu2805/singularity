package com.vibecraft.workspace.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * A short random tag identifying this running copy of the service, for CODE_REVIEW.md PRE-03's bootstrap heartbeat.
 *
 * <p>Handles: generating one value once per JVM run and logging it at startup, so a stale-bootstrap row in the
 * database can be traced back to whichever instance last touched it - a rolling deployment runs several of these at
 * once, each with its own id, and none of them share state with each other outside the database.
 *
 * <p>A random value rather than the pod's hostname because it needs no coordination and cannot collide with a
 * previous incarnation of the same pod name reused by Kubernetes after a restart, which a stale heartbeat's whole
 * purpose is to tell apart from a still-running one.
 */
@Component
@Slf4j
public class InstanceId {

    private final String value = UUID.randomUUID().toString().substring(0, 8);

    public InstanceId() {
        log.info("This workspace-service instance is {}", value);
    }

    public String value() {
        return value;
    }
}
