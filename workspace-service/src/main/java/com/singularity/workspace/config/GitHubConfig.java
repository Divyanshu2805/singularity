package com.singularity.workspace.config;

import com.singularity.workspace.service.impl.GitHubClient;
import com.singularity.workspace.util.GitHubTokenCipher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Switches the GitHub connection on.
 *
 * <p>Handles: binding the GitHub settings, and making the two things that need them - the client that calls GitHub
 * and the cipher that keeps stored tokens - only when {@code github.enabled} is true.
 *
 * <p>The condition is what lets the secrets have no defaults. With the feature off nothing here exists, the
 * placeholders are never resolved, and the service starts; with it on, a missing secret fails the binding and the
 * service does not start. The service that answers the browser exists either way and says the feature is unavailable
 * when these beans are absent.
 */
@Configuration
@ConditionalOnProperty(name = "github.enabled", havingValue = "true")
@EnableConfigurationProperties(GitHubProperties.class)
public class GitHubConfig {

    @Bean
    public GitHubTokenCipher gitHubTokenCipher(GitHubProperties properties) {
        return new GitHubTokenCipher(properties.tokenKey());
    }

    @Bean
    public GitHubClient gitHubClient(GitHubProperties properties) {
        return new GitHubClient(properties);
    }
}
