package com.vibecraft.workspace.config;

import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.ConfigBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The fabric8 Kubernetes client the live-preview pipeline claims and drives runner pods with.
 *
 * <p>Handles: building it from the ambient configuration - in-cluster service account when deployed, the local
 * kubectl context in development. In-cluster, the bearer token is re-read from the projected service-account
 * token file on every request via an {@link io.fabric8.kubernetes.client.OAuthTokenProvider} rather than the
 * one-time snapshot the plain auto-detected {@link Config} takes at client-build time - fabric8 6.13.4's exec/
 * upload WebSocket handshake (PreviewRunnerPool.exec/uploadFile) was seen presenting a stale token even while
 * ordinary REST calls on the same client (claim/list/patch, which do auto-refresh) kept succeeding, so the
 * handshake authenticated as some other identity than the pod's real one and got a genuine RBAC 403 - surfaced
 * to callers as "Couldn't reach the preview cluster" even though the cluster and the RBAC grant were both fine.
 */
@Configuration
public class KubernetesConfig {

    private static final Path IN_CLUSTER_TOKEN_FILE = Path.of("/var/run/secrets/kubernetes.io/serviceaccount/token");

    @Bean
    public KubernetesClient kubernetesClient() {
        Config config = Config.autoConfigure(null);
        if (Files.isReadable(IN_CLUSTER_TOKEN_FILE)) {
            config = new ConfigBuilder(config)
                    .withOauthTokenProvider(KubernetesConfig::readInClusterToken)
                    .build();
        }
        return new KubernetesClientBuilder().withConfig(config).build();
    }

    private static String readInClusterToken() {
        try {
            return Files.readString(IN_CLUSTER_TOKEN_FILE).trim();
        } catch (IOException e) {
            throw new IllegalStateException("Couldn't read the in-cluster service account token", e);
        }
    }
}
