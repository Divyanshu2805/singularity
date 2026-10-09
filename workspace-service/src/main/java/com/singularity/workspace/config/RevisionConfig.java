package com.singularity.workspace.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Binds the revision-publish subsystem's configuration: build validation, and the limits on how large a project
 * may grow.
 */
@Configuration
@EnableConfigurationProperties({RevisionValidationProperties.class, ProjectFileLimits.class})
public class RevisionConfig {
}
