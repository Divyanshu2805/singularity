package com.vibecraft.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * Where live previews run and how they are reached. See the {@code preview:} block in {@code application.yaml}.
 *
 * @param namespace    the Kubernetes namespace holding the runner pool ({@code k8s/runner-pods.yml})
 * @param publicScheme scheme of the URL handed to the browser
 * @param publicDomain every preview is served at {@code <slug>.<publicDomain>}. {@code localhost} in dev, because
 *                     browsers resolve any {@code *.localhost} name to 127.0.0.1 with no hosts-file edits
 * @param publicPort   port the preview proxy is reachable on from the browser; null, or the scheme's default, is
 *                     left out of the URL
 * @param runnerPort   port the Vite dev server listens on inside a runner pod
 * @param storageAlias the {@code mc} alias configured in the syncer container ({@code MC_HOST_<alias>})
 * @param bucket       the MinIO bucket project files live in - the same one {@code ProjectFileServiceImpl} writes
 * @param idleTimeout  a preview nobody has looked at for this long is stopped and its runner released
 * @param bootTimeout  how long install + dev-server start may take before the attempt is failed
 * @param routeTtl     expiry of a proxy route in Redis. Refreshed while the preview is in use, so a route the
 *                     backend forgot about (it crashed) still disappears on its own
 */
@ConfigurationProperties(prefix = "preview")
public record PreviewProperties(
        String namespace,
        String publicScheme,
        String publicDomain,
        Integer publicPort,
        int runnerPort,
        String storageAlias,
        String bucket,
        Duration idleTimeout,
        Duration bootTimeout,
        Duration routeTtl
) {

    public String urlFor(String hostname) {
        boolean defaultPort = publicPort == null
                || (publicPort == 80 && "http".equals(publicScheme))
                || (publicPort == 443 && "https".equals(publicScheme));
        return publicScheme + "://" + hostname + (defaultPort ? "" : ":" + publicPort) + "/";
    }
}
