package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.common.error.ExternalServiceException;
import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.dsl.ExecWatch;
import io.fabric8.kubernetes.client.dsl.NonNamespaceOperation;
import io.fabric8.kubernetes.client.dsl.PodResource;
import io.fabric8.kubernetes.api.model.PodList;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * The pool of warm runner pods from {@code k8s/runner-pods.yml}, and the commands run inside them.
 *
 * <p>How the pool works: the {@code runner-pool} Deployment selects pods labelled {@code status=idle}. Claiming a
 * pod relabels it {@code status=busy}, which takes it <em>out</em> of the ReplicaSet - so Kubernetes immediately
 * starts a fresh idle pod to replace it, and the claimed one belongs to its preview alone. Releasing it is simply
 * deleting it; nothing ever returns a used pod to the pool, so no project's files or processes leak into another.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewRunnerPool {

    static final String APP_LABEL = "app";
    static final String RUNNER_APP = "runner";
    static final String POOL_LABEL = "status";
    static final String IDLE = "idle";
    static final String BUSY = "busy";
    static final String PROJECT_LABEL = "project-id";
    /** When a pod was claimed. Its creation time is when it joined the pool, which says nothing about its preview. */
    static final String CLAIMED_AT_ANNOTATION = "vibecraft.dev/claimed-at";

    static final String SYNCER_CONTAINER = "syncer";
    static final String RUNNER_CONTAINER = "runner";

    private final KubernetesClient client;
    private final PreviewProperties properties;

    /** What a finished command printed (stdout and stderr interleaved) and how it exited. */
    public record ExecResult(int exitCode, String output) {
        public boolean succeeded() {
            return exitCode == 0;
        }
    }

    /**
     * Claims a ready idle pod for the project, or empty when the pool has none free right now.
     *
     * <p>The relabel is an {@code update} carrying the resourceVersion the pod was listed with, so two requests
     * that picked the same pod can't both win: the API server rejects the second with 409 and it moves on to the
     * next pod. A {@code patch}/{@code edit} would have let both succeed and put two projects in one pod.
     */
    public Optional<Pod> claim(Long projectId) {
        try {
            List<Pod> idle = pods().withLabel(APP_LABEL, RUNNER_APP).withLabel(POOL_LABEL, IDLE)
                    .list().getItems().stream()
                    .filter(PreviewRunnerPool::isReady)
                    .toList();

            for (Pod pod : idle) {
                pod.getMetadata().getLabels().put(POOL_LABEL, BUSY);
                pod.getMetadata().getLabels().put(PROJECT_LABEL, projectId.toString());
                pod.getMetadata().getAnnotations().put(CLAIMED_AT_ANNOTATION, Instant.now().toString());
                try {
                    Pod claimed = pods().resource(pod).update();
                    log.info("Claimed runner pod {} for project {}", claimed.getMetadata().getName(), projectId);
                    return Optional.of(claimed);
                } catch (KubernetesClientException e) {
                    if (e.getCode() != 409) throw e;
                    log.debug("Runner pod {} was claimed by someone else first, trying the next one",
                            pod.getMetadata().getName());
                }
            }
            return Optional.empty();
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        }
    }

    /** Deletes a claimed pod outright. Idempotent - releasing a pod that's already gone is fine. */
    public void release(String podName) {
        if (podName == null) return;
        try {
            pods().withName(podName).withGracePeriod(0).delete();
            log.info("Released runner pod {}", podName);
        } catch (KubernetesClientException e) {
            if (e.getCode() == 404) return;
            throw clusterUnreachable(e);
        }
    }

    /** Whether the pod still exists and is running. False after an eviction, a node restart, or a manual delete. */
    public boolean isAlive(String podName) {
        if (podName == null) return false;
        try {
            Pod pod = pods().withName(podName).get();
            return pod != null && pod.getMetadata().getDeletionTimestamp() == null
                    && "Running".equals(pod.getStatus().getPhase());
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        }
    }

    public Optional<String> podIp(String podName) {
        try {
            Pod pod = pods().withName(podName).get();
            return Optional.ofNullable(pod).map(p -> p.getStatus().getPodIP());
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        }
    }

    /** Claimed pods, with when they were claimed (null for one relabelled by hand). */
    public List<ClaimedPod> claimedPods() {
        try {
            return pods().withLabel(APP_LABEL, RUNNER_APP).withLabel(POOL_LABEL, BUSY)
                    .list().getItems().stream()
                    .map(pod -> new ClaimedPod(pod.getMetadata().getName(), claimedAt(pod)))
                    .toList();
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        }
    }

    public record ClaimedPod(String name, Instant claimedAt) {
    }

    /**
     * Runs a shell script in one of the pod's containers and waits for it to exit. A script that starts something
     * long-running must detach it itself ({@code setsid ... &}) - this returns when the shell does.
     */
    public ExecResult exec(String podName, String container, Duration timeout, String script) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ExecWatch watch = pods().withName(podName).inContainer(container)
                .writingOutput(output)
                .writingError(output)
                .exec("sh", "-c", script)) {
            Integer exitCode = watch.exitCode().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            return new ExecResult(exitCode == null ? -1 : exitCode, output.toString(StandardCharsets.UTF_8));
        } catch (TimeoutException e) {
            return new ExecResult(-1, output.toString(StandardCharsets.UTF_8)
                    + "\n(timed out after " + timeout.toSeconds() + "s)");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while running a command in " + podName, e);
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        } catch (Exception e) {
            throw new ExternalServiceException("Couldn't run a command in the preview runner", e);
        }
    }

    private NonNamespaceOperation<Pod, PodList, PodResource> pods() {
        return client.pods().inNamespace(properties.namespace());
    }

    private static boolean isReady(Pod pod) {
        if (pod.getMetadata().getDeletionTimestamp() != null) return false;
        if (!"Running".equals(pod.getStatus().getPhase()) || pod.getStatus().getPodIP() == null) return false;
        List<ContainerStatus> statuses = pod.getStatus().getContainerStatuses();
        return statuses != null && !statuses.isEmpty() && statuses.stream().allMatch(ContainerStatus::getReady);
    }

    private static Instant claimedAt(Pod pod) {
        String value = pod.getMetadata().getAnnotations() == null ? null
                : pod.getMetadata().getAnnotations().get(CLAIMED_AT_ANNOTATION);
        try {
            return value == null ? null : Instant.parse(value);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static ExternalServiceException clusterUnreachable(KubernetesClientException e) {
        return new ExternalServiceException("Couldn't reach the preview cluster", e);
    }
}
