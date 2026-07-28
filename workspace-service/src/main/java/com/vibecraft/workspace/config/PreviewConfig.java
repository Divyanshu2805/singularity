package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Wires up the live-preview subsystem's configuration.
 *
 * <p>Handles: binding the preview and port-forward properties, and turning on scheduling so the preview reaper's
 * periodic sweep actually runs.
 */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({PreviewProperties.class, PreviewPortForwardProperties.class})
public class PreviewConfig {
}
