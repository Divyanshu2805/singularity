package com.singularity.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The OAuth app this service signs people in to GitHub with, and the bounds around a push.
 *
 * <p>Handles: the app's client id and secret, the key that encrypts stored tokens and signs the state of a sign-in,
 * GitHub's two addresses, where GitHub sends the browser back, the permission asked for, how long a sign-in may take,
 * how long one call to GitHub may take, how many pushes one person may make in an hour, and how large a file may be
 * before it is uploaded by itself rather than inside the request that lists every file.
 *
 * <p>This is bound only when {@code github.enabled} is true ({@link GitHubConfig}). The three values that come from
 * the environment have no defaults, so switching the feature on without them stops the service at start-up; with it
 * off they are never read, and a deployment that has not registered an app runs as before.
 *
 * <p>A value still spelled as its placeholder counts as missing. Binding does not refuse a placeholder it cannot
 * resolve - it hands over the text {@code ${GITHUB_CLIENT_ID}} as the value - and the first real boot with the
 * feature on and nothing set showed it: the service would have started with that text as its client id, had the
 * token key not happened to be checked for its shape.
 *
 * <p>The two addresses are settings so a test can point them at a stand-in. They are never taken from a request.
 */
@ConfigurationProperties(prefix = "github")
public record GitHubProperties(
        String clientId,
        String clientSecret,
        String tokenKey,
        String apiUrl,
        String webUrl,
        String callbackUrl,
        String scope,
        Duration stateTtl,
        Duration requestTimeout,
        int maxPushesPerHour,
        int maxInlineFileBytes,
        int maxInlineTotalBytes
) {

    public GitHubProperties {
        if (isUnset(clientId) || isUnset(clientSecret) || isUnset(tokenKey)) {
            throw new IllegalStateException("github.enabled is true, so GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and "
                    + "GITHUB_TOKEN_KEY must all be set.");
        }
        apiUrl = trimmed(apiUrl, "https://api.github.com");
        webUrl = trimmed(webUrl, "https://github.com");
        scope = isBlank(scope) ? "repo" : scope;
        stateTtl = stateTtl == null ? Duration.ofMinutes(10) : stateTtl;
        requestTimeout = requestTimeout == null ? Duration.ofSeconds(20) : requestTimeout;
        maxPushesPerHour = maxPushesPerHour <= 0 ? 20 : maxPushesPerHour;
        maxInlineFileBytes = maxInlineFileBytes <= 0 ? 200_000 : maxInlineFileBytes;
        maxInlineTotalBytes = maxInlineTotalBytes <= 0 ? 3_000_000 : maxInlineTotalBytes;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean isUnset(String value) {
        return isBlank(value) || value.contains("${");
    }

    private static String trimmed(String url, String fallback) {
        String value = isBlank(url) ? fallback : url.strip();
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
