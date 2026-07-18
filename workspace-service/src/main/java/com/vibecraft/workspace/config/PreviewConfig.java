package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Registers the preview properties and turns on scheduling for {@code PreviewReaper}. */
@Configuration
@EnableScheduling
@EnableConfigurationProperties({PreviewProperties.class, PreviewPortForwardProperties.class})
public class PreviewConfig {
}
