package com.singularity.workspace.service.impl;

import com.singularity.workspace.config.PreviewProperties;
import com.singularity.common.error.ExternalServiceException;
import io.fabric8.kubernetes.api.model.ContainerStatus;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.dsl.ExecWatch;
import io.fabric8.kubernetes.client.dsl.NonNamespaceOperation;
import io.fabric8.kubernetes.client.dsl.PodResource;
import io.fabric8.kubernetes.client.dsl.base.PatchContext;
import io.fabric8.kubernetes.client.dsl.base.PatchType;
import io.fabric8.kubernetes.api.model.PodList;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * The pool of warm runner pods, and the commands run inside them.
 *
 * <p>Handles: claiming a ready idle pod for a project, releasing one, checking a pod is still alive, reading its
 * address, listing claimed pods for the orphan sweep, and running a shell script in one of a pod's containers with a
 * timeout - or returning its output as bounded raw bytes (a build's tar coming out) - which a publish uses to build in a
 * pod of its own. A project goes in the other way as one uploaded tar file, not through a command's standard input: the
 * exec's websocket cannot say "end of input", so a tar read from stdin waits for the rest of its archive until the exec
 * times out (found by PublishPipelineIT on a real cluster).
 *
 * <p>How the pool works: a Deployment selects pods labelled idle. Claiming relabels a pod busy, which takes it out of
 * the ReplicaSet, so Kubernetes immediately starts a fresh idle pod to replace it and the claimed one belongs to its
 * preview alone. Releasing is simply deleting it; nothing ever returns a used pod to the pool, so no project's files
 * or processes can leak into another.
 *
 * <p>The claim is a merge patch carrying the resourceVersion the pod was listed with, which the API server enforces
 * as a precondition: two requests that picked the same pod cannot both win - the loser gets a conflict and moves on.
 * It patches rather than updating the listed pod because this client version cannot serialize a fetched pod back
 * under this Jackson version: anything a real API server returns that the model does not know lands in an
 * additional-properties map, and a non-empty one is what breaks it. Every listed pod has some, so trimming one field
 * is not enough.
 *
 * <p>A script that starts something long-running must detach it itself, because exec returns when the shell does.
 *
 * <p>The claim time is written under both the current annotation and the legacy {@code vibecraft.dev} one, and read
 * from either. During a rolling deploy or a rollback two versions of this service run side by side, and the orphan
 * sweep releases a claimed pod that has no claim time at once, so a version that cannot read the other's key would
 * release a pod its neighbour had only just claimed. Drop the legacy key only when no version that predates this one
 * can still be rolled back to.
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
    static final String CLAIMED_AT_ANNOTATION = "singularity.dev/claimed-at";
    static final String LEGACY_CLAIMED_AT_ANNOTATION = "vibecraft.dev/claimed-at";

    static final String SYNCER_CONTAINER = "syncer";
    static final String RUNNER_CONTAINER = "runner";

    private final KubernetesClient client;
    private final PreviewProperties properties;

    public record ExecResult(int exitCode, String output) {
        public boolean succeeded() {
            return exitCode == 0;
        }
    }

    public Optional<Pod> claim(Long projectId) {
        try {
            List<Pod> idle = pods().withLabel(APP_LABEL, RUNNER_APP).withLabel(POOL_LABEL, IDLE)
                    .list().getItems().stream()
                    .filter(PreviewRunnerPool::isReady)
                    .toList();

            for (Pod pod : idle) {
                String patch = client.getKubernetesSerialization().asJson(claimPatch(pod, projectId, Instant.now()));
                try {
                    Pod claimed = pods().withName(pod.getMetadata().getName())
                            .patch(PatchContext.of(PatchType.JSON_MERGE), patch);
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

    static Pod claimPatch(Pod idle, Long projectId, Instant claimedAt) {
        return new PodBuilder().withNewMetadata()
                .withResourceVersion(idle.getMetadata().getResourceVersion())
                .addToLabels(POOL_LABEL, BUSY)
                .addToLabels(PROJECT_LABEL, projectId.toString())
                .addToAnnotations(CLAIMED_AT_ANNOTATION, claimedAt.toString())
                .addToAnnotations(LEGACY_CLAIMED_AT_ANNOTATION, claimedAt.toString())
                .endMetadata().build();
    }

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

    /**
     * Uploads bytes to a path inside a container - a tar-based transfer (the same mechanism {@code kubectl cp}
     * uses), unlike {@link #exec}, which only ever pipes a script through a shell. CODE_REVIEW.md AI-09 uses this
     * to materialize a staged revision's snapshot into a freshly claimed, disposable validation pod; nothing else
     * in this service needs to write arbitrary file content into a pod today.
     */
    public void uploadFile(String podName, String container, String pathInContainer, byte[] content) {
        try (InputStream in = new ByteArrayInputStream(content)) {
            boolean uploaded = pods().withName(podName).inContainer(container).file(pathInContainer).upload(in);
            if (!uploaded) {
                throw new ExternalServiceException("Upload of " + pathInContainer + " to " + podName + " did not succeed",
                        new IllegalStateException("fabric8 upload() returned false"));
            }
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        } catch (ExternalServiceException e) {
            throw e;
        } catch (Exception e) {
            throw new ExternalServiceException("Couldn't upload " + pathInContainer + " to " + podName, e);
        }
    }

    public record BytesResult(int exitCode, byte[] output, String error, boolean overflowed) {
        public boolean succeeded() {
            return exitCode == 0 && !overflowed;
        }
    }

    /**
     * Runs a script and returns what it wrote to standard output as raw bytes, up to {@code maxBytes}; anything past
     * that is dropped and reported as {@code overflowed}, so a pod cannot make the service hold an unbounded buffer.
     * Standard error comes back separately, as text, so a tar on standard output is never mixed with a warning.
     */
    public BytesResult execForBytes(String podName, String container, Duration timeout, String script, int maxBytes) {
        BoundedOutput output = new BoundedOutput(maxBytes);
        ByteArrayOutputStream error = new ByteArrayOutputStream();
        try (ExecWatch watch = pods().withName(podName).inContainer(container)
                .writingOutput(output)
                .writingError(error)
                .exec("sh", "-c", script)) {
            Integer exitCode = watch.exitCode().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            return new BytesResult(exitCode == null ? -1 : exitCode, output.toByteArray(),
                    error.toString(StandardCharsets.UTF_8), output.overflowed());
        } catch (TimeoutException e) {
            return new BytesResult(-1, output.toByteArray(), error.toString(StandardCharsets.UTF_8)
                    + "\n(timed out after " + timeout.toSeconds() + "s)", output.overflowed());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while running a command in " + podName, e);
        } catch (KubernetesClientException e) {
            throw clusterUnreachable(e);
        } catch (Exception e) {
            throw new ExternalServiceException("Couldn't run a command in the preview runner", e);
        }
    }

    static final class BoundedOutput extends OutputStream {
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private final int max;
        private boolean overflowed;

        BoundedOutput(int max) {
            this.max = max;
        }

        @Override
        public synchronized void write(int b) {
            if (bytes.size() >= max) {
                overflowed = true;
                return;
            }
            bytes.write(b);
        }

        @Override
        public synchronized void write(byte[] buffer, int offset, int length) {
            int room = max - bytes.size();
            if (length > room) {
                overflowed = true;
                length = Math.max(room, 0);
            }
            bytes.write(buffer, offset, length);
        }

        synchronized byte[] toByteArray() {
            return bytes.toByteArray();
        }

        synchronized boolean overflowed() {
            return overflowed;
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

    static Instant claimedAt(Pod pod) {
        Map<String, String> annotations = pod.getMetadata().getAnnotations();
        String value = annotations == null ? null
                : annotations.getOrDefault(CLAIMED_AT_ANNOTATION, annotations.get(LEGACY_CLAIMED_AT_ANNOTATION));
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
