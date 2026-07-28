package com.vibecraft.workspace.service.impl;

import io.fabric8.kubernetes.api.model.FieldsV1;
import io.fabric8.kubernetes.api.model.ManagedFieldsEntry;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.client.utils.KubernetesSerialization;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers that claiming a runner pod sends a minimal patch rather than writing back a pod fetched from the API server.
 *
 * <p>The fixture is a real pod from a current kind cluster. Writing it back fails to serialize under this client and
 * Jackson version - any non-empty additional-properties map throws - and clearing the obvious offending field is not
 * enough, which is why the claim patches instead. The patch must also carry the resource version as a precondition,
 * so two claims cannot land on the same pod.
 */
class PreviewRunnerPoolTest {

    private static final KubernetesSerialization SERIALIZATION = new KubernetesSerialization();
    private static final Instant CLAIMED_AT = Instant.parse("2026-09-20T10:15:30Z");

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
