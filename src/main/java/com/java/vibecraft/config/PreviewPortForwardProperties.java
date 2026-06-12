package com.java.vibecraft.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;
import java.util.Map;

/**
 * Port-forwards the backend opens into the preview cluster while it runs - see {@code PreviewPortForwarder}.
 * Local development only: on a real cluster Redis and the proxy are reachable directly, so leave this disabled.
 *
 * @param forwards each one binds {@code 127.0.0.1:<localPort>} to {@code podPort} on a ready pod carrying
 *                 {@code podLabels}, in {@code preview.namespace}
 */
@ConfigurationProperties(prefix = "preview.port-forward")
public record PreviewPortForwardProperties(boolean enabled, List<Forward> forwards) {

    public record Forward(String name, Map<String, String> podLabels, int podPort, int localPort) {
    }
}
