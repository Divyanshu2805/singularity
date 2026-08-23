package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Binds the revision-publish subsystem's configuration (CODE_REVIEW.md AI-05/AI-09).
 */
@Configuration
@EnableConfigurationProperties(RevisionValidationProperties.class)
public class RevisionConfig {
}
