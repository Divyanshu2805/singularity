package com.singularity.workspace.service.impl;

import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.PublishedAppRepository;
import com.singularity.workspace.service.impl.PreviewRunnerPool.BytesResult;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import com.singularity.workspace.service.impl.PublishSourceReader.Captured;
import com.singularity.workspace.util.TarArchive;
import com.singularity.workspace.util.TarArchive.TooLargeException;
import io.fabric8.kubernetes.api.model.Pod;
import io.fabric8.kubernetes.api.model.PodBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mockito;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * A publish build against a scripted runner pod: the happy path, and every way it can end that is not the happy path.
 *
 * <p>The pod is a mock whose scripts answer by exit code and output, so these cases pin what the builder does with
 * each answer - which failure kind and sentence it records, what it stores and in what order, and that it always
 * gives the pod back. The ordering is the point of the success case: the files go in first, the pointer next and the
 * database last, because the pointer is what makes a build live and a build that is ended from outside must never leave
 * one behind. What a real pod, a real {@code npm install} and a real proxy do is the preview pipeline test's.
 */
class PublishBuilderTest {

    private static final long APP_ID = 11L;
    private static final long PROJECT_ID = 5L;
    private static final long BUILD = 1L;
    private static final String SLUG = "my-app-ab12";
    private static final String POD = "runner-abc";
    private static final String RUNNER = PreviewRunnerPool.RUNNER_CONTAINER;

    private final PublishedAppRepository appRepository = mock(PublishedAppRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final PublishSourceReader sourceReader = mock(PublishSourceReader.class);
    private final PublishedStore store = mock(PublishedStore.class);

    private final PublishBuilder builder = new PublishBuilder(appRepository, runnerPool, sourceReader, store,
            PublishingTestProperties.defaults());

    private final Map<String, byte[]> sources = new LinkedHashMap<>();
    private final Map<String, byte[]> site = new LinkedHashMap<>();

    private static byte[] text(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    @BeforeEach
    void aPodThatBuildsCleanly() {
        builder.pollInterval = Duration.ofMillis(1);
        sources.put("package.json", text("{}"));
        sources.put("src/App.tsx", text("export default 1;"));
        sources.put(".env", text("VITE_SECRET=1"));
        site.put("index.html", text("<html></html>"));
        site.put("assets/app.js", text("console.log(1)"));

        when(sourceReader.capture(PROJECT_ID)).thenReturn(new Captured(3L, sources, 100));
        when(appRepository.updatePhase(eq(APP_ID), eq(BUILD), anyString(), any())).thenReturn(1);
        when(appRepository.heartbeat(eq(APP_ID), eq(BUILD), any())).thenReturn(1);
        when(appRepository.assignPod(eq(APP_ID), eq(BUILD), anyString(), any())).thenReturn(1);
        when(appRepository.markLive(eq(APP_ID), eq(BUILD), anyString(), anyInt(), anyLong(), any())).thenReturn(1);
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.of(pod()));
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.UNPACK_SCRIPT))).thenReturn(new ExecResult(0, ""));
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.INSTALL_SCRIPT))).thenReturn(new ExecResult(0, "added 200 packages"));
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.BUILD_SCRIPT))).thenReturn(new ExecResult(0, "built in 9s"));
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.CHECK_SCRIPT))).thenReturn(new ExecResult(0, "SIZE_KB=120\n"));
        when(runnerPool.execForBytes(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.COLLECT_SCRIPT), anyInt()))
                .thenAnswer(call -> new BytesResult(0, TarArchive.pack(site), "", false));
    }

    private static Pod pod() {
        return new PodBuilder().withNewMetadata().withName(POD).endMetadata().build();
    }

    private void run() {
        builder.run(APP_ID, SLUG, BUILD, PROJECT_ID);
    }

    private void expectFailure(PublishFailureKind kind) {
        verify(appRepository).markFailed(eq(APP_ID), eq(BUILD), eq(kind), anyString(), any());
        verify(appRepository, never()).markLive(anyLong(), anyLong(), anyString(), anyInt(), anyLong(), any());
        verify(store, never()).writePointer(anyString(), anyString(), anyLong(), any());
    }

    @Test
    @DisplayName("a clean build is stored, then pointed at, then recorded live - and the pod is given back")
    void happyPath() {
        run();

        ArgumentCaptor<Map<String, byte[]>> stored = ArgumentCaptor.forClass(Map.class);
        verify(store).putSite(eq(SLUG), eq("b1/"), stored.capture());
        assertThat(stored.getValue().keySet()).containsExactly("index.html", "assets/app.js");
        assertThat(stored.getValue().get("index.html")).isEqualTo(site.get("index.html"));
        ArgumentCaptor<Map<String, byte[]>> shared = ArgumentCaptor.forClass(Map.class);
        verify(store).putSources(eq(SLUG), eq("b1/"), shared.capture());
        assertThat(shared.getValue().keySet()).containsExactly("package.json", "src/App.tsx");

        InOrder order = Mockito.inOrder(store, appRepository);
        order.verify(store).putSite(anyString(), anyString(), any());
        order.verify(store).putSources(anyString(), anyString(), any());
        order.verify(store).writePointer(eq(SLUG), eq("b1/"), eq(BUILD), any());
        order.verify(appRepository).markLive(eq(APP_ID), eq(BUILD), eq("b1/"), eq(2), eq(27L), any());
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("the revision it read is recorded on the row, so the panel can tell what changed since")
    void recordsTheRevision() {
        run();

        verify(appRepository).recordBuildRevision(APP_ID, BUILD, 3L);
    }

    @Test
    @DisplayName("each step is written to the row in the order it happens")
    void stepsInOrder() {
        run();

        InOrder order = Mockito.inOrder(appRepository);
        for (String step : new String[]{PublishBuilder.COLLECTING, PublishBuilder.WAITING_FOR_RUNNER, PublishBuilder.COPYING,
                PublishBuilder.INSTALLING, PublishBuilder.BUILDING, PublishBuilder.CHECKING,
                PublishBuilder.COLLECTING_BUILD, PublishBuilder.PUBLISHING}) {
            order.verify(appRepository, Mockito.atLeastOnce()).updatePhase(eq(APP_ID), eq(BUILD), eq(step), any());
        }
    }

    @Test
    @DisplayName("the project goes into the pod as one uploaded tar holding every file, then is unpacked there")
    void projectGoesInAsOneTar() {
        run();

        ArgumentCaptor<byte[]> sent = ArgumentCaptor.forClass(byte[].class);
        verify(runnerPool).uploadFile(eq(POD), eq(RUNNER), eq(PublishBuilder.PROJECT_TAR), sent.capture());
        verify(runnerPool).exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.UNPACK_SCRIPT));
        Map<String, byte[]> unpacked = TarArchive.unpack(sent.getValue(), new TarArchive.Limits(100, 1_000_000, 1_000_000));
        assertThat(unpacked.keySet()).containsExactlyElementsOf(sources.keySet());
    }

    @Test
    @DisplayName("a build that is not a revision - none yet - still builds, from whatever the files are")
    void noRevisionStillBuilds() {
        when(sourceReader.capture(PROJECT_ID)).thenReturn(new Captured(null, sources, 100));

        run();

        verify(appRepository).recordBuildRevision(APP_ID, BUILD, null);
        verify(appRepository).markLive(eq(APP_ID), eq(BUILD), anyString(), anyInt(), anyLong(), any());
    }

    @Test
    @DisplayName("a package that does not exist fails as the project's install, with the package named and the output kept")
    void installFailure() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.INSTALL_SCRIPT))).thenReturn(new ExecResult(1,
                "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/zzz-missing - Not found"));

        run();

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> log = ArgumentCaptor.forClass(String.class);
        verify(appRepository).markFailed(eq(APP_ID), eq(BUILD), eq(PublishFailureKind.INSTALL), detail.capture(), log.capture());
        assertThat(detail.getValue()).contains("zzz-missing");
        assertThat(log.getValue()).contains("404 Not Found");
        verify(runnerPool, never()).exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.BUILD_SCRIPT));
        verify(store, never()).putSite(anyString(), anyString(), any());
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("an install that runs out of time is a timeout")
    void installTimeout() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.INSTALL_SCRIPT)))
                .thenReturn(new ExecResult(-1, "\n(timed out after 240s)"));

        run();

        expectFailure(PublishFailureKind.TIMEOUT);
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a registry that cannot be reached is the platform's failure, not the project's")
    void registryDown() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.INSTALL_SCRIPT)))
                .thenReturn(new ExecResult(1, "npm error code ETIMEDOUT"));

        run();

        expectFailure(PublishFailureKind.PLATFORM);
    }

    @Test
    @DisplayName("a build that fails says why in plain words and keeps the bundler's own output")
    void buildFailure() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.BUILD_SCRIPT))).thenReturn(new ExecResult(1,
                "error during build:\nRollup failed to resolve import \"./Missing\" from \"/app/src/App.tsx\"."));

        run();

        ArgumentCaptor<String> detail = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> log = ArgumentCaptor.forClass(String.class);
        verify(appRepository).markFailed(eq(APP_ID), eq(BUILD), eq(PublishFailureKind.BUILD), detail.capture(), log.capture());
        assertThat(detail.getValue()).contains("./Missing");
        assertThat(log.getValue()).contains("Rollup failed to resolve");
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a build that runs out of time is a timeout")
    void buildTimeout() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.BUILD_SCRIPT)))
                .thenReturn(new ExecResult(-1, "\n(timed out after 240s)"));

        run();

        expectFailure(PublishFailureKind.TIMEOUT);
    }

    @Test
    @DisplayName("a build that leaves no page behind says there is nothing to publish")
    void noOutput() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.CHECK_SCRIPT)))
                .thenReturn(new ExecResult(PublishBuilder.NO_OUTPUT_EXIT, ""));

        run();

        expectFailure(PublishFailureKind.NO_OUTPUT);
        verify(runnerPool, never()).execForBytes(anyString(), anyString(), any(), anyString(), anyInt());
    }

    @Test
    @DisplayName("a build with no index.html at its top level is refused even when the pod said it had one")
    void noTopLevelIndex() {
        site.clear();
        site.put("nested/index.html", text("<html></html>"));

        run();

        expectFailure(PublishFailureKind.NO_OUTPUT);
    }

    @Test
    @DisplayName("a build the pod reports as over the size limit is refused before a byte of it is read")
    void tooLargeByTheirOwnCount() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.CHECK_SCRIPT)))
                .thenReturn(new ExecResult(0, "SIZE_KB=999999\n"));

        run();

        expectFailure(PublishFailureKind.TOO_LARGE);
        verify(runnerPool, never()).execForBytes(anyString(), anyString(), any(), anyString(), anyInt());
    }

    @Test
    @DisplayName("a build that overflows the buffer on the way out is refused too, whatever the pod claimed")
    void tooLargeOnTheWayOut() {
        when(runnerPool.execForBytes(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.COLLECT_SCRIPT), anyInt()))
                .thenReturn(new BytesResult(0, new byte[10], "", true));

        run();

        expectFailure(PublishFailureKind.TOO_LARGE);
    }

    @Test
    @DisplayName("a tar with a name that climbs out of the folder is the project's failure, with the reason")
    void hostileTar() {
        site.clear();
        site.put("index.html", text("x"));
        when(runnerPool.execForBytes(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.COLLECT_SCRIPT), anyInt()))
                .thenAnswer(call -> new BytesResult(0, tarWithEscape(), "", false));

        run();

        expectFailure(PublishFailureKind.BUILD);
    }

    private static byte[] tarWithEscape() {
        try {
            var bytes = new java.io.ByteArrayOutputStream();
            try (var tar = new org.apache.commons.compress.archivers.tar.TarArchiveOutputStream(bytes)) {
                var entry = new org.apache.commons.compress.archivers.tar.TarArchiveEntry("./../../escape.txt");
                entry.setSize(1);
                tar.putArchiveEntry(entry);
                tar.write('x');
                tar.closeArchiveEntry();
            }
            return bytes.toByteArray();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("a project too large to read fails as too large, before any runner is claimed")
    void sourcesTooLarge() {
        when(sourceReader.capture(PROJECT_ID)).thenThrow(new TooLargeException("The project has more than 500 files."));

        run();

        expectFailure(PublishFailureKind.TOO_LARGE);
        verify(runnerPool, never()).claim(anyLong());
    }

    @Test
    @DisplayName("when every runner stays busy the build gives up with a capacity failure and a sentence to try again")
    void noRunnerFree() {
        when(runnerPool.claim(PROJECT_ID)).thenReturn(Optional.empty());

        run();

        expectFailure(PublishFailureKind.CAPACITY);
        verify(runnerPool, Mockito.atLeast(2)).claim(PROJECT_ID);
        verify(runnerPool, never()).release(anyString());
    }

    @Test
    @DisplayName("a cluster that cannot be reached is the platform's failure, and the pod is still given back")
    void clusterDown() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.INSTALL_SCRIPT)))
                .thenThrow(new ExternalServiceException("Couldn't reach the preview cluster", null));

        run();

        expectFailure(PublishFailureKind.PLATFORM);
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a pod that cannot take the files is the platform's failure")
    void unpackFails() {
        when(runnerPool.exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.UNPACK_SCRIPT)))
                .thenReturn(new ExecResult(2, "tar: short read"));

        run();

        expectFailure(PublishFailureKind.PLATFORM);
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a build ended from outside before it starts does nothing at all")
    void cancelledAtTheStart() {
        when(appRepository.updatePhase(eq(APP_ID), eq(BUILD), anyString(), any())).thenReturn(0);

        run();

        verify(sourceReader, never()).capture(anyLong());
        verify(runnerPool, never()).claim(anyLong());
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
        verify(store, never()).putSite(anyString(), anyString(), any());
    }

    @Test
    @DisplayName("a build ended while it waited for a runner gives that runner straight back")
    void cancelledWhileClaiming() {
        when(appRepository.assignPod(eq(APP_ID), eq(BUILD), anyString(), any())).thenReturn(0);

        run();

        verify(runnerPool, Mockito.atLeastOnce()).release(POD);
        verify(runnerPool, never()).exec(anyString(), anyString(), any(), anyString());
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
    }

    @Test
    @DisplayName("a build ended mid-way stops at its next step, leaves no failure behind and still frees the pod")
    void cancelledMidWay() {
        when(appRepository.updatePhase(eq(APP_ID), eq(BUILD), eq(PublishBuilder.BUILDING), any())).thenReturn(0);

        run();

        verify(runnerPool, never()).exec(eq(POD), eq(RUNNER), any(), eq(PublishBuilder.BUILD_SCRIPT));
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
        verify(store, never()).putSite(anyString(), anyString(), any());
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a build ended just before it goes live is discarded: its files are deleted and no pointer outlives it")
    void cancelledJustBeforeGoingLive() {
        when(appRepository.markLive(eq(APP_ID), eq(BUILD), anyString(), anyInt(), anyLong(), any())).thenReturn(0);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(
                PublishedApp.builder().id(APP_ID).slug(SLUG).status(PublishStatus.UNPUBLISHED).build()));

        run();

        verify(store).deleteBuild(SLUG, "b1/");
        verify(store).deletePointer(SLUG);
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
        verify(runnerPool).release(POD);
    }

    @Test
    @DisplayName("a discarded build does not touch the pointer of an app that is live again with a newer build")
    void discardLeavesALiveAppsPointer() {
        when(appRepository.markLive(eq(APP_ID), eq(BUILD), anyString(), anyInt(), anyLong(), any())).thenReturn(0);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(
                PublishedApp.builder().id(APP_ID).slug(SLUG).status(PublishStatus.LIVE).build()));

        run();

        verify(store).deleteBuild(SLUG, "b1/");
        verify(store, never()).deletePointer(anyString());
    }

    @Test
    @DisplayName("a failure to store the build deletes whatever part of it was stored and fails on the platform's account")
    void storageFailsMidWay() {
        Mockito.doThrow(new com.singularity.common.error.FileStorageException("down", null))
                .when(store).putSources(anyString(), anyString(), any());

        run();

        expectFailure(PublishFailureKind.PLATFORM);
        verify(store).deleteBuild(SLUG, "b1/");
    }

    @Test
    @DisplayName("the log kept with a failure has colour codes removed and is cut to its tail")
    void logIsCleanedAndCut() {
        String noisy = "\u001b[31mred\u001b[0m " + "x".repeat(20_000) + " THE END";

        String kept = builder.tail(noisy);

        assertThat(kept).doesNotContain("\u001b").endsWith("THE END").hasSizeLessThan(8_100).startsWith("...");
        assertThat(builder.tail("   ")).isNull();
        assertThat(builder.tail(null)).isNull();
        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), isNull());
    }
}
