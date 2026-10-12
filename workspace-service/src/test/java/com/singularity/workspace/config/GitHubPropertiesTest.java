package com.singularity.workspace.config;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Tests for {@link GitHubProperties}, the settings of the GitHub connection.
 *
 * <p>Handles: the feature refusing to come up without its client id, secret and key - blank, missing, or still
 * spelled as the placeholder binding leaves behind when the environment has no such value - and the settings nobody
 * has to give falling back to GitHub's real addresses and sensible bounds.
 */
class GitHubPropertiesTest {

    private static GitHubProperties with(String clientId, String clientSecret, String tokenKey) {
        return new GitHubProperties(clientId, clientSecret, tokenKey, null, null, "https://app.example.dev/github/callback",
                null, null, null, 0, 0, 0);
    }

    @Test
    void theFeatureDoesNotComeUpWithoutItsThreeSecrets() {
        assertThatThrownBy(() -> with(null, "s", "k")).isInstanceOf(IllegalStateException.class).hasMessageContaining("GITHUB_CLIENT_ID");
        assertThatThrownBy(() -> with("id", " ", "k")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> with("id", "s", "")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aValueStillSpelledAsItsPlaceholderCountsAsMissing() {
        assertThatThrownBy(() -> with("${GITHUB_CLIENT_ID}", "s", "k")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> with("id", "${GITHUB_CLIENT_SECRET}", "k")).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> with("id", "s", "${GITHUB_TOKEN_KEY}")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void whatNobodyHasToGiveFallsBackToGitHubsOwnAddressesAndSensibleBounds() {
        GitHubProperties properties = with("id", "s", "k");

        assertThat(properties.apiUrl()).isEqualTo("https://api.github.com");
        assertThat(properties.webUrl()).isEqualTo("https://github.com");
        assertThat(properties.scope()).isEqualTo("repo");
        assertThat(properties.stateTtl()).isEqualTo(Duration.ofMinutes(10));
        assertThat(properties.requestTimeout()).isEqualTo(Duration.ofSeconds(20));
        assertThat(properties.maxPushesPerHour()).isEqualTo(20);
        assertThat(properties.maxInlineFileBytes()).isEqualTo(200_000);
    }

    @Test
    void aTrailingSlashOnAnAddressIsDropped() {
        GitHubProperties properties = new GitHubProperties("id", "s", "k", "http://127.0.0.1:9/", " http://127.0.0.1:9 ",
                "https://app.example.dev/github/callback", null, null, null, 0, 0, 0);

        assertThat(properties.apiUrl()).isEqualTo("http://127.0.0.1:9");
        assertThat(properties.webUrl()).isEqualTo("http://127.0.0.1:9");
    }
}
