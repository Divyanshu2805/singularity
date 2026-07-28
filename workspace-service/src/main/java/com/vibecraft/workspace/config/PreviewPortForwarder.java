package com.vibecraft.workspace.config;

import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.LocalPortForward;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Keeps the local port-forwards into the kind cluster open for as long as the backend runs.
 *
 * <p>Handles: opening each configured forward synchronously at startup, before anything talks to Redis, then
 * re-checking every few seconds and re-opening one whose pod was replaced by a rollout or a crash. A local port
 * something else already holds is left alone and logged once, and a cluster that is down is warned about once rather
 * than every few seconds.
 *
 * <p>It exists because kind has no load balancer or host port mappings, so without these forwards previews cannot be
 * routed or reached. A forward is pinned to one pod and dies silently with it, which is why the watchdog is needed
 * rather than a one-off setup step.
 */
@Component
@ConditionalOnProperty(prefix = "preview.port-forward", name = "enabled", havingValue = "true")
@RequiredArgsConstructor
@Slf4j
public class PreviewPortForwarder implements SmartLifecycle {

    private static final long CHECK_EVERY_SECONDS = 5;

    private final KubernetesClient client;
    private final PreviewProperties previewProperties;
    private final PreviewPortForwardProperties properties;

    private List<ForwardState> states = List.of();
    private ScheduledExecutorService watchdog;
    private volatile boolean running;

    @Override
    public void start() {
        states = properties.forwards() == null ? List.of()
                : properties.forwards().stream().map(ForwardState::new).toList();
        states.forEach(this::ensure);

        watchdog = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "preview-port-forward");
            thread.setDaemon(true);
            return thread;
        });
        watchdog.scheduleWithFixedDelay(() -> states.forEach(this::ensure),
                CHECK_EVERY_SECONDS, CHECK_EVERY_SECONDS, TimeUnit.SECONDS);
        running = true;
    }

    @Override
    public void stop() {
        running = false;
        if (watchdog != null) watchdog.shutdownNow();
        states.forEach(ForwardState::close);
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        return Integer.MIN_VALUE + 1000;
    }

    private void ensure(ForwardState state) {
        var forward = state.forward;
        try {
            if (state.isHealthy() && podIsReady(state.podName)) return;

            if (state.current != null) {
                log.info("Port-forward for {} lost its pod {}, reconnecting", forward.name(), state.podName);
                state.close();
            }

            if (!isLocalPortFree(forward.localPort())) {
                if (!state.warnedPortBusy) {
                    log.info("localhost:{} is already in use - leaving {} to whatever holds it (e.g. dev-port-forward.ps1)",
                            forward.localPort(), forward.name());
                    state.warnedPortBusy = true;
                }
                return;
            }
            state.warnedPortBusy = false;

            Pod pod = client.pods().inNamespace(previewProperties.namespace())
                    .withLabels(forward.podLabels())
                    .list().getItems().stream()
                    .filter(PreviewPortForwarder::isReady)
                    .findFirst().orElse(null);
            if (pod == null) {
                warnOnce(state, "No ready pod for " + forward.name() + " (labels " + forward.podLabels()
                        + ") in namespace " + previewProperties.namespace() + " - is the kind cluster up?");
                return;
            }

            String podName = pod.getMetadata().getName();
            state.current = client.pods().inNamespace(previewProperties.namespace()).withName(podName)
                    .portForward(forward.podPort(), InetAddress.getLoopbackAddress(), forward.localPort());
            state.podName = podName;
            state.warnedFailure = false;
            log.info("Forwarding localhost:{} -> {} ({}:{})", forward.localPort(), forward.name(), podName, forward.podPort());
        } catch (RuntimeException e) {
            state.close();
            warnOnce(state, "Couldn't forward " + forward.name() + " to localhost:" + forward.localPort()
                    + ": " + e.getMessage());
        }
    }

    private void warnOnce(ForwardState state, String message) {
        if (state.warnedFailure) {
            log.debug(message);
        } else {
            log.warn(message + " (retrying quietly every " + CHECK_EVERY_SECONDS + "s)");
            state.warnedFailure = true;
        }
    }

    private boolean podIsReady(String podName) {
        if (podName == null) return false;
        Pod pod = client.pods().inNamespace(previewProperties.namespace()).withName(podName).get();
        return pod != null && isReady(pod);
    }

    private static boolean isReady(Pod pod) {
        if (pod.getMetadata().getDeletionTimestamp() != null) return false;
        if (!"Running".equals(pod.getStatus().getPhase())) return false;
        List<ContainerStatus> statuses = pod.getStatus().getContainerStatuses();
        return statuses != null && !statuses.isEmpty() && statuses.stream().allMatch(ContainerStatus::getReady);
    }

    private static boolean isLocalPortFree(int port) {
        try (ServerSocket socket = new ServerSocket()) {
            socket.setReuseAddress(false);
            socket.bind(new InetSocketAddress(InetAddress.getLoopbackAddress(), port));
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    private static final class ForwardState {
        final PreviewPortForwardProperties.Forward forward;
        LocalPortForward current;
        String podName;
        boolean warnedPortBusy;
        boolean warnedFailure;

        ForwardState(PreviewPortForwardProperties.Forward forward) {
            this.forward = forward;
        }

        boolean isHealthy() {
            return current != null && current.isAlive() && !current.errorOccurred();
        }

        void close() {
            if (current == null) return;
            try {
                current.close();
            } catch (IOException | RuntimeException e) {
            }
            current = null;
            podName = null;
        }
    }
}
