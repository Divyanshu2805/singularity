package com.vibecraft.workspace.config;

import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The fabric8 Kubernetes client the live-preview pipeline claims and drives runner pods with.
 *
 * <p>Handles: building it from the ambient configuration - in-cluster service account when deployed, the local
 * kubectl context in development.
 */
@Configuration
public class KubernetesConfig {

    @Bean
    public KubernetesClient kubernetesClient() {
        return new KubernetesClientBuilder().build();
    }
}
