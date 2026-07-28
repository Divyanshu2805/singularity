package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Map;

/**
 * Which port-forwards the backend opens into the preview cluster while it runs.
 *
 * <p>Handles: the enable flag and a list of forwards, each binding a local port to a port on a ready pod matching the
 * given labels in the preview namespace.
 *
 * <p>Local development only. On a real cluster Redis and the proxy are reachable directly, so this stays disabled.
 */
@ConfigurationProperties(prefix = "preview.port-forward")
public record PreviewPortForwardProperties(boolean enabled, List<Forward> forwards) {

    public record Forward(String name, Map<String, String> podLabels, int podPort, int localPort) {
    }
}
