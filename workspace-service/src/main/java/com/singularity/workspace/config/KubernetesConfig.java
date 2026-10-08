package com.singularity.workspace.config;

import io.fabric8.kubernetes.client.Config;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The fabric8 Kubernetes client the live-preview pipeline claims and drives runner pods with.
 *
 * <p>Handles: building it for the kubeconfig context named in preview.kube-context, or from the ambient
 * configuration - the in-cluster service account when deployed - when that is blank.
 *
 * <p>Local development names its context rather than using whichever one kubectl currently points at. A kubeconfig
 * with no current context left every preview failing with nothing to say why, and one pointing at another cluster
 * would have had this service claiming pods there.
 */
@Configuration
public class KubernetesConfig {

    @Bean
    public KubernetesClient kubernetesClient(@Value("${preview.kube-context:}") String context) {
        if (context == null || context.isBlank()) {
            return new KubernetesClientBuilder().build();
        }
        return new KubernetesClientBuilder().withConfig(Config.autoConfigure(context.strip())).build();
    }
}
