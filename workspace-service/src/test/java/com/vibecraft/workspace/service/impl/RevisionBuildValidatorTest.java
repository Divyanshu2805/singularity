package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.RevisionValidationProperties;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.service.BlobStore;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-09's orchestration in {@link RevisionBuildValidator}: the {@code enabled} gate, failing
 * open on a saturated warm pool rather than blocking the publish, that the claimed pod is always released - even
 * when something mid-flow throws - and the diagnostic string's tail-truncation/ANSI-stripping. The real fabric8
 * pod-exec/upload behavior and a real {@code npm install}/{@code tsc} run are verified live against the `vibecraft`
 * kind cluster, not here (CLAUDE.md's Testing Expectations - this pipeline has no automated coverage otherwise).
 */
class RevisionBuildValidatorTest {

    private static final long PROJECT_ID = 1L;
    private static final String POD_NAME = "runner-pool-abc123";

    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final RevisionSnapshotReader snapshotReader = mock(RevisionSnapshotReader.class);
    private final BlobStore blobStore = mock(BlobStore.class);

    private RevisionBuildValidator validator(boolean enabled) {
        RevisionValidationProperties properties = new RevisionValidationProperties(
                enabled, "npx tsc --noEmit", Duration.ofMinutes(2), Duration.ofMinutes(2), 8000);
        return new RevisionBuildValidator(runnerPool, snapshotReader, blobStore, properties);
    }

    private ProjectFileRevision revision() {
        return ProjectFileRevision.builder().id(10L).projectId(PROJECT_ID).build();
    }

    private Pod claimedPod() {
        return new PodBuilder().withNewMetadata().withName(POD_NAME).endMetadata().build();
    }

    @Test
    @DisplayName("disabled - never claims a pod, always passes")
    void disabledNeverClaimsAPod() {
        RevisionBuildValidator validator = validator(false);

        Optional<String> result = validator.validate(revision(), List.of());

        assertThat(result).isEmpty();
        verify(runnerPool, never()).claim(any());
    }

    @Test
    @DisplayName("no idle pod available - fails open, never execs or releases")
    void noIdlePodFailsOpen() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty());
        RevisionBuildValidator validator = validator(true);

        Optional<String> result = validator.validate(revision(), List.of());

        assertThat(result).isEmpty();
        verify(runnerPool, never()).exec(any(), any(), any(), any());
        verify(runnerPool, never()).release(any());
    }

    @Test
    @DisplayName("a failed install is reported and the pod is still released")
    void failedInstallIsReportedAndPodReleased() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(claimedPod()));
        when(snapshotReader.snapshot(10L)).thenReturn(Map.of("src/App.tsx", "hash-1"));
        when(blobStore.read("hash-1")).thenReturn("content".getBytes(StandardCharsets.UTF_8));
        when(runnerPool.exec(eq(POD_NAME), anyString(), any(), org.mockito.ArgumentMatchers.contains("npm install")))
                .thenReturn(new PreviewRunnerPool.ExecResult(1, "npm ERR! missing dependency"));

        Optional<String> result = validator(true).validate(revision(), List.of());

        assertThat(result).isPresent();
        assertThat(result.get()).contains("npm install failed").contains("npm ERR! missing dependency");
        verify(runnerPool).release(POD_NAME);
        verify(runnerPool, never()).exec(eq(POD_NAME), anyString(), any(), eq("cd /app && npx tsc --noEmit"));
    }

    @Test
    @DisplayName("a failed build check is reported and the pod is still released")
    void failedBuildIsReportedAndPodReleased() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(claimedPod()));
        when(snapshotReader.snapshot(10L)).thenReturn(Map.of("src/App.tsx", "hash-1"));
        when(blobStore.read("hash-1")).thenReturn("content".getBytes(StandardCharsets.UTF_8));
        when(runnerPool.exec(eq(POD_NAME), anyString(), any(), org.mockito.ArgumentMatchers.contains("npm install")))
                .thenReturn(new PreviewRunnerPool.ExecResult(0, "added 42 packages"));
        when(runnerPool.exec(eq(POD_NAME), anyString(), any(), eq("cd /app && npx tsc --noEmit")))
                .thenReturn(new PreviewRunnerPool.ExecResult(1, "src/App.tsx(3,5): error TS2322"));

        Optional<String> result = validator(true).validate(revision(), List.of());

        assertThat(result).isPresent();
        assertThat(result.get()).contains("Build validation failed").contains("error TS2322");
        verify(runnerPool).release(POD_NAME);
    }

    @Test
    @DisplayName("success - materializes, installs, builds, releases, in order, and passes")
    void successMaterializesInstallsBuildsAndReleases() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(claimedPod()));
        when(snapshotReader.snapshot(10L)).thenReturn(Map.of("src/App.tsx", "hash-1"));
        when(blobStore.read("hash-1")).thenReturn("content".getBytes(StandardCharsets.UTF_8));
        when(runnerPool.exec(eq(POD_NAME), anyString(), any(), any()))
                .thenReturn(new PreviewRunnerPool.ExecResult(0, "ok"));

        Optional<String> result = validator(true).validate(revision(), List.of());

        assertThat(result).isEmpty();
        InOrder order = inOrder(runnerPool);
        order.verify(runnerPool).exec(eq(POD_NAME), anyString(), any(), org.mockito.ArgumentMatchers.contains("mkdir -p"));
        order.verify(runnerPool).uploadFile(eq(POD_NAME), anyString(), eq("/app/src/App.tsx"), any());
        order.verify(runnerPool).exec(eq(POD_NAME), anyString(), any(), org.mockito.ArgumentMatchers.contains("npm install"));
        order.verify(runnerPool).exec(eq(POD_NAME), anyString(), any(), eq("cd /app && npx tsc --noEmit"));
        order.verify(runnerPool).release(POD_NAME);
    }

    @Test
    @DisplayName("an exception while materializing the snapshot still releases the claimed pod")
    void exceptionDuringMaterializeStillReleasesThePod() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(claimedPod()));
        when(snapshotReader.snapshot(10L)).thenReturn(Map.of("src/App.tsx", "hash-1"));
        when(blobStore.read("hash-1")).thenThrow(new RuntimeException("MinIO unreachable"));

        try {
            validator(true).validate(revision(), List.of());
        } catch (RuntimeException expected) {
            // propagates - the point of this test is that release() still ran despite it
        }

        verify(runnerPool).release(POD_NAME);
    }

    @Test
    @DisplayName("diagnostics strips ANSI codes and truncates from the head, keeping the tail")
    void diagnosticsStripsAnsiAndTruncatesKeepingTheTail() {
        RevisionValidationProperties properties = new RevisionValidationProperties(
                true, "npx tsc --noEmit", Duration.ofMinutes(2), Duration.ofMinutes(2), 30);
        RevisionBuildValidator validator = new RevisionBuildValidator(runnerPool, snapshotReader, blobStore, properties);

        String raw = "[31mnoise noise noise noise[0m the real error at the end";
        String result = validator.diagnostics("Build validation failed", raw);

        assertThat(result).startsWith("Build validation failed:\n");
        assertThat(result).doesNotContain("");
        assertThat(result).endsWith("the real error at the end");
        assertThat(result).contains("...");
    }
}
