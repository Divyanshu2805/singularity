package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.PreviewProperties;
import io.fabric8.kubernetes.api.model.FieldsV1;
import io.fabric8.kubernetes.api.model.ManagedFieldsEntry;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import io.fabric8.kubernetes.api.model.PodList;
import io.fabric8.kubernetes.api.model.StatusBuilder;
import io.fabric8.kubernetes.client.KubernetesClient;
import io.fabric8.kubernetes.client.KubernetesClientException;
import io.fabric8.kubernetes.client.dsl.FilterWatchListDeletable;
import io.fabric8.kubernetes.client.dsl.MixedOperation;
import io.fabric8.kubernetes.client.dsl.NonNamespaceOperation;
import io.fabric8.kubernetes.client.dsl.PodResource;
import io.fabric8.kubernetes.client.dsl.base.PatchContext;
import io.fabric8.kubernetes.client.utils.KubernetesSerialization;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers that claiming a runner pod sends a minimal patch rather than writing back a pod fetched from the API server,
 * and (CODE_REVIEW.md PRE-01) that the resource-version precondition it carries actually does what it is there for:
 * of two callers racing for the one idle pod, exactly one wins.
 *
 * <p>The fixture is a real pod from a current kind cluster. Writing it back fails to serialize under this client and
 * Jackson version - any non-empty additional-properties map throws - and clearing the obvious offending field is not
 * enough, which is why the claim patches instead. The patch must also carry the resource version as a precondition,
 * so two claims cannot land on the same pod.
 */
class PreviewRunnerPoolTest {

    private static final KubernetesSerialization SERIALIZATION = new KubernetesSerialization();
    private static final Instant CLAIMED_AT = Instant.parse("2026-09-20T10:15:30Z");

    private static final PreviewProperties PROPERTIES = new PreviewProperties(
            "vibecraft-ai", "http", "localhost", null, 5173, "local", "projects",
            Duration.ofMinutes(30), Duration.ofMinutes(2), Duration.ofMinutes(5), "secret", Duration.ofHours(6));

    @Test
    void theFixtureIsAPodThatCarriesTheFieldsFabric8CannotSerialize() throws IOException {
        Pod pod = idleRunnerPod();

        assertThat(pod.getMetadata().getManagedFields()).hasSize(2)
                .extracting(ManagedFieldsEntry::getFieldsV1).extracting(FieldsV1::getAdditionalProperties)
                .allSatisfy(fields -> assertThat(fields).isNotEmpty());
        assertThat(pod.getStatus().getAdditionalProperties()).containsKey("observedGeneration");
    }

    @Test
    void theClaimPatchSerializesForAPodTheApiServerReturned() throws IOException {
        Pod pod = idleRunnerPod();

        String json = SERIALIZATION.asJson(PreviewRunnerPool.claimPatch(pod, 131L, CLAIMED_AT));

        assertThat(json).isNotBlank();
    }

    @Test
    void theClaimPatchSendsOnlyTheClaimAndTheResourceVersionItsPreconditionedOn() throws IOException {
        Pod pod = idleRunnerPod();
        String listedResourceVersion = pod.getMetadata().getResourceVersion();

        String json = SERIALIZATION.asJson(PreviewRunnerPool.claimPatch(pod, 131L, CLAIMED_AT));
        Map<String, Object> body = asMap(SERIALIZATION.unmarshal(json, Map.class));
        Map<String, Object> metadata = asMap(body.get("metadata"));

        assertThat(body).containsOnlyKeys("apiVersion", "kind", "metadata");
        assertThat(metadata).containsOnlyKeys("resourceVersion", "labels", "annotations");
        assertThat(metadata.get("resourceVersion")).isEqualTo(listedResourceVersion).isNotNull();
        assertThat(asMap(metadata.get("labels"))).isEqualTo(Map.of("status", "busy", "project-id", "131"));
        assertThat(asMap(metadata.get("annotations")))
                .isEqualTo(Map.of("vibecraft.dev/claimed-at", "2026-09-20T10:15:30Z"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void ofTwoProjectsRacingForTheOneIdlePodExactlyOneIsAdmitted() throws Exception {
        Pod idle = idleRunnerPod();
        String podName = idle.getMetadata().getName();

        KubernetesClient client = mock(KubernetesClient.class);
        MixedOperation<Pod, PodList, PodResource> pods = mock(MixedOperation.class);
        NonNamespaceOperation<Pod, PodList, PodResource> namespaced = mock(NonNamespaceOperation.class);
        FilterWatchListDeletable<Pod, PodList, PodResource> filtered = mock(FilterWatchListDeletable.class);
        PodList podList = mock(PodList.class);
        PodResource podResource = mock(PodResource.class);

        when(client.getKubernetesSerialization()).thenReturn(SERIALIZATION);
        when(client.pods()).thenReturn(pods);
        when(pods.inNamespace(PROPERTIES.namespace())).thenReturn(namespaced);
        when(namespaced.withLabel(PreviewRunnerPool.APP_LABEL, PreviewRunnerPool.RUNNER_APP)).thenReturn(filtered);
        when(filtered.withLabel(PreviewRunnerPool.POOL_LABEL, PreviewRunnerPool.IDLE)).thenReturn(filtered);
        when(filtered.list()).thenReturn(podList);
        when(podList.getItems()).thenReturn(List.of(idle));
        when(namespaced.withName(podName)).thenReturn(podResource);

        // Simulates what the real API server's resourceVersion precondition does: of two concurrent patches against
        // the same listed pod, the first to arrive wins and the second gets a 409, same as PreviewRunnerPool.claim
        // already handles for a real cluster. The latch forces both threads into the patch call together instead of
        // one finishing before the other starts, which would prove nothing about the race.
        AtomicBoolean claimed = new AtomicBoolean(false);
        CountDownLatch bothArrived = new CountDownLatch(2);
        when(podResource.patch(any(PatchContext.class), anyString())).thenAnswer(invocation -> {
            bothArrived.countDown();
            bothArrived.await(2, TimeUnit.SECONDS);
            if (claimed.compareAndSet(false, true)) {
                return new PodBuilder(idle).editMetadata().withResourceVersion("next").endMetadata().build();
            }
            throw new KubernetesClientException("Operation cannot be fulfilled: the object has been modified", 409,
                    new StatusBuilder().withCode(409).build());
        });

        PreviewRunnerPool pool = new PreviewRunnerPool(client, PROPERTIES);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            CompletableFuture<Optional<Pod>> projectA = CompletableFuture.supplyAsync(() -> pool.claim(101L), executor);
            CompletableFuture<Optional<Pod>> projectB = CompletableFuture.supplyAsync(() -> pool.claim(102L), executor);
            List<Optional<Pod>> results = List.of(projectA.get(5, TimeUnit.SECONDS), projectB.get(5, TimeUnit.SECONDS));

            assertThat(results).filteredOn(Optional::isPresent).hasSize(1);
            assertThat(results).filteredOn(Optional::isEmpty).hasSize(1);
        } finally {
            executor.shutdown();
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object value) {
        return (Map<String, Object>) value;
    }

    private static Pod idleRunnerPod() throws IOException {
        try (InputStream in = PreviewRunnerPoolTest.class.getResourceAsStream("/preview/idle-runner-pod.json")) {
            assertThat(in).as("fixture /preview/idle-runner-pod.json").isNotNull();
            return SERIALIZATION.unmarshal(new String(in.readAllBytes(), StandardCharsets.UTF_8), Pod.class);
        }
    }
}
