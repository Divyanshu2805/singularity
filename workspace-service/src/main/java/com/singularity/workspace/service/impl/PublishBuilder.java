package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.FileStorageException;
import com.singularity.workspace.config.PublishingProperties;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.PublishedAppRepository;
import com.singularity.workspace.service.impl.PreviewRunnerPool.BytesResult;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import com.singularity.workspace.service.impl.PublishSourceReader.Captured;
import com.singularity.workspace.util.PublishFailureExplainer;
import com.singularity.workspace.util.PublishFailureExplainer.Explained;
import com.singularity.workspace.util.TarArchive;
import com.singularity.workspace.util.TarArchive.TooLargeException;
import io.fabric8.kubernetes.api.model.Pod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Pattern;

import static com.singularity.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;

/**
 * Makes a published app's production build in a runner pod of its own, off the request thread.
 *
 * <p>Handles: reading the project's files at one revision, claiming a runner (waiting a short while when every one is
 * busy), putting the files into it as one tar (uploaded as a single file, then unpacked by tar in the pod), {@code npm install}, {@code npm run build}, checking that a page came
 * out, taking the build back out as one tar under hard limits, storing the build and the sources it was made from, and
 * - last - writing the pointer that puts it live. Each step is written to the row for the tab to poll, and each way
 * to fail is recorded with its kind, one plain sentence and the tail of the output.
 *
 * <p>The code runs only in the pod, which is deleted at the end whatever happened, and never as a pod already serving
 * a preview: a build on a person's own preview pod could starve the dev server they are looking at. Nothing it
 * produces is trusted. Every path in the returned tar goes through {@link TarArchive}, which ignores links and
 * rejects anything that is not a plain relative path, and the build is bounded by file count and size before and
 * after it is read. What comes back is stored as bytes and served as bytes; it is never run here.
 *
 * <p>The build can be ended from outside - Unpublish, the project being deleted, the sweeper - by changing the row.
 * Every write here names its build number and applies only while that build is still the one under way, so a build
 * that lost simply finds out at its next step, deletes what it stored and stops; it can never put a pointer live
 * over what replaced it. While a command runs in the pod, a second thread keeps the row's heartbeat fresh, because the
 * sweeper fails a build whose heartbeat has stopped and a single install can run for minutes.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PublishBuilder {

    static final String COLLECTING = "Collecting your files";
    static final String WAITING_FOR_RUNNER = "Starting a build machine";
    static final String COPYING = "Copying your files";
    static final String INSTALLING = "Installing packages";
    static final String BUILDING = "Building your app";
    static final String CHECKING = "Checking the result";
    static final String COLLECTING_BUILD = "Collecting the build";
    static final String PUBLISHING = "Putting it online";

    static final int NO_OUTPUT_EXIT = 91;
    static final String INSTALL_SCRIPT = "cd /app && npm install --no-audit --no-fund --loglevel=error";
    static final String BUILD_SCRIPT = "cd /app && CI=true npm run build";
    static final String CHECK_SCRIPT = "cd /app || exit 90\n"
            + "[ -f dist/index.html ] || exit " + NO_OUTPUT_EXIT + "\n"
            + "echo \"SIZE_KB=$(du -sk dist | cut -f1)\"\n";
    static final String COLLECT_SCRIPT = "cd /app/dist && tar cf - .";
    static final String PROJECT_TAR = "/tmp/project.tar";
    static final String UNPACK_SCRIPT = "mkdir -p /app && tar -xf " + PROJECT_TAR + " -C /app && rm -f " + PROJECT_TAR;

    private static final Pattern ANSI_CODES = Pattern.compile("\\[[0-9;]*[A-Za-z]");
    private static final Pattern SIZE_KB = Pattern.compile("SIZE_KB=(\\d+)");
    private static final Duration HEARTBEAT_EVERY = Duration.ofSeconds(10);
    private static final Duration QUICK_STEP = Duration.ofMinutes(2);
    private static final long PER_FILE_TAR_OVERHEAD = 1536;
    private static final long TAR_TRAILER = 20_480;
    private static final long MAX_SINGLE_FILE_BYTES = 25L * 1024 * 1024;

    private final PublishedAppRepository appRepository;
    private final PreviewRunnerPool runnerPool;
    private final PublishSourceReader sourceReader;
    private final PublishedStore store;
    private final PublishingProperties properties;

    Duration pollInterval = Duration.ofSeconds(2);

    private final class Cancelled extends RuntimeException {
        Cancelled() {
            super("The build was ended from outside", null, false, false);
        }
    }

    private final class Failed extends RuntimeException {
        final PublishFailureKind kind;
        final String log;

        Failed(PublishFailureKind kind, String detail, String log) {
            super(detail, null, false, false);
            this.kind = kind;
            this.log = log;
        }
    }

    @Async
    public void run(Long appId, String slug, long build, Long projectId) {
        String podName = null;
        String prefix = PublishedStore.buildPrefix(build);
        boolean stored = false;
        try {
            phase(appId, build, COLLECTING);
            Captured captured = sourceReader.capture(projectId);
            appRepository.recordBuildRevision(appId, build, captured.revisionId());

            phase(appId, build, WAITING_FOR_RUNNER);
            podName = claimRunner(appId, build, projectId);

            phase(appId, build, COPYING);
            runnerPool.uploadFile(podName, RUNNER_CONTAINER, PROJECT_TAR, TarArchive.pack(captured.files()));
            ExecResult copied = runnerPool.exec(podName, RUNNER_CONTAINER, QUICK_STEP, UNPACK_SCRIPT);
            if (!copied.succeeded()) {
                throw new Failed(PublishFailureKind.PLATFORM, "Couldn't copy your files to the build machine.", copied.output());
            }

            phase(appId, build, INSTALLING);
            String podForInstall = podName;
            ExecResult install = beating(appId, build,
                    () -> runnerPool.exec(podForInstall, RUNNER_CONTAINER, properties.installTimeout(), INSTALL_SCRIPT));
            if (!install.succeeded()) {
                Explained why = install.exitCode() < 0
                        ? new Explained(PublishFailureKind.TIMEOUT, "Installing the packages took too long and was stopped.")
                        : PublishFailureExplainer.install(install.output());
                throw new Failed(why.kind(), why.detail(), install.output());
            }

            phase(appId, build, BUILDING);
            String podForBuild = podName;
            ExecResult built = beating(appId, build,
                    () -> runnerPool.exec(podForBuild, RUNNER_CONTAINER, properties.buildTimeout(), BUILD_SCRIPT));
            if (!built.succeeded()) {
                Explained why = built.exitCode() < 0
                        ? new Explained(PublishFailureKind.TIMEOUT, "The build took too long and was stopped.")
                        : PublishFailureExplainer.build(built.output());
                throw new Failed(why.kind(), why.detail(), built.output());
            }

            phase(appId, build, CHECKING);
            ExecResult checked = runnerPool.exec(podName, RUNNER_CONTAINER, QUICK_STEP, CHECK_SCRIPT);
            if (checked.exitCode() == NO_OUTPUT_EXIT || checked.exitCode() == 90) {
                throw new Failed(PublishFailureKind.NO_OUTPUT,
                        "The build finished but left no dist/index.html, so there is no page to publish. "
                                + "Check that the build writes to the dist folder.", built.output());
            }
            if (!checked.succeeded()) {
                throw new Failed(PublishFailureKind.PLATFORM, "Couldn't check the build's output.", checked.output());
            }
            assertSizeWithinLimit(checked.output());

            phase(appId, build, COLLECTING_BUILD);
            Map<String, byte[]> site = collect(podName);
            if (!site.containsKey("index.html")) {
                throw new Failed(PublishFailureKind.NO_OUTPUT, "The build has no index.html at its top level.", built.output());
            }

            phase(appId, build, PUBLISHING);
            Map<String, byte[]> sources = PublishSourceReader.forSharing(captured.files());
            long bytes = site.values().stream().mapToLong(content -> content.length).sum();
            stored = true;
            store.putSite(slug, prefix, site);
            store.putSources(slug, prefix, sources);
            phase(appId, build, PUBLISHING);
            store.writePointer(slug, prefix, build, Instant.now());
            if (appRepository.markLive(appId, build, prefix, site.size(), bytes, Instant.now()) == 0) {
                throw new Cancelled();
            }
            log.info("Published {} (build {}, {} files, {} bytes)", slug, build, site.size(), bytes);
            stored = false;
        } catch (Cancelled e) {
            log.info("Build {} of {} was ended from outside; discarding it", build, slug);
        } catch (Failed e) {
            fail(appId, build, e.kind, e.getMessage(), e.log);
        } catch (TooLargeException e) {
            fail(appId, build, PublishFailureKind.TOO_LARGE, e.getMessage(), null);
        } catch (BadRequestException e) {
            fail(appId, build, PublishFailureKind.BUILD, e.getMessage(), null);
        } catch (ConflictException e) {
            fail(appId, build, PublishFailureKind.PLATFORM, e.getMessage(), null);
        } catch (ExternalServiceException | FileStorageException e) {
            log.warn("Publishing {} (build {}) failed on the platform", slug, build, e);
            fail(appId, build, PublishFailureKind.PLATFORM,
                    "Something went wrong on our side while publishing. Try again in a moment.", null);
        } catch (RuntimeException e) {
            log.error("Publishing {} (build {}) failed unexpectedly", slug, build, e);
            fail(appId, build, PublishFailureKind.PLATFORM,
                    "Something went wrong on our side while publishing. Try again in a moment.", null);
        } finally {
            if (podName != null) release(podName);
            if (stored) discard(appId, slug, prefix);
        }
    }

    private void phase(Long appId, long build, String detail) {
        if (appRepository.updatePhase(appId, build, detail, Instant.now()) == 0) {
            throw new Cancelled();
        }
    }

    private String claimRunner(Long appId, long build, Long projectId) {
        Instant giveUpAt = Instant.now().plus(properties.runnerWait());
        while (true) {
            Optional<Pod> claimed = runnerPool.claim(projectId);
            if (claimed.isPresent()) {
                String podName = claimed.get().getMetadata().getName();
                if (appRepository.assignPod(appId, build, podName, Instant.now()) == 0) {
                    release(podName);
                    throw new Cancelled();
                }
                return podName;
            }
            if (Instant.now().isAfter(giveUpAt)) {
                throw new Failed(PublishFailureKind.CAPACITY,
                        "No build machine came free in time. Try again in a moment.", null);
            }
            sleep(pollInterval);
            if (appRepository.heartbeat(appId, build, Instant.now()) == 0) {
                throw new Cancelled();
            }
        }
    }

    private void assertSizeWithinLimit(String output) {
        var matcher = SIZE_KB.matcher(output == null ? "" : output);
        if (matcher.find() && Long.parseLong(matcher.group(1)) * 1024 > properties.maxOutputBytes()) {
            throw new TooLargeException("The build is larger than " + (properties.maxOutputBytes() / (1024 * 1024))
                    + " MB, which is more than can be published.");
        }
    }

    private Map<String, byte[]> collect(String podName) {
        long tarLimit = Math.min(Integer.MAX_VALUE - 1024L, properties.maxOutputBytes()
                + properties.maxOutputFiles() * PER_FILE_TAR_OVERHEAD + TAR_TRAILER);
        BytesResult archive = runnerPool.execForBytes(podName, RUNNER_CONTAINER, properties.collectTimeout(),
                COLLECT_SCRIPT, (int) tarLimit);
        if (archive.overflowed()) {
            throw new TooLargeException("The build is larger than " + (properties.maxOutputBytes() / (1024 * 1024))
                    + " MB, which is more than can be published.");
        }
        if (!archive.succeeded()) {
            throw new Failed(PublishFailureKind.PLATFORM, "Couldn't take the build out of the build machine.", archive.error());
        }
        return TarArchive.unpack(archive.output(), new TarArchive.Limits(
                properties.maxOutputFiles(), properties.maxOutputBytes(), MAX_SINGLE_FILE_BYTES));
    }

    private <T> T beating(Long appId, long build, Supplier<T> work) {
        Thread beat = Thread.ofVirtual().name("publish-heartbeat-", 0).start(() -> {
            while (!Thread.currentThread().isInterrupted()) {
                try {
                    Thread.sleep(HEARTBEAT_EVERY);
                } catch (InterruptedException e) {
                    return;
                }
                try {
                    appRepository.heartbeat(appId, build, Instant.now());
                } catch (RuntimeException e) {
                    log.debug("Couldn't refresh the heartbeat of build {} of app {}", build, appId, e);
                }
            }
        });
        try {
            return work.get();
        } finally {
            beat.interrupt();
        }
    }

    private void fail(Long appId, long build, PublishFailureKind kind, String detail, String output) {
        appRepository.markFailed(appId, build, kind, detail, tail(output));
    }

    private void release(String podName) {
        try {
            runnerPool.release(podName);
        } catch (RuntimeException e) {
            log.warn("Couldn't release build pod {}; the orphan sweep will: {}", podName, e.getMessage());
        }
    }

    private void discard(Long appId, String slug, String prefix) {
        try {
            store.deleteBuild(slug, prefix);
            appRepository.findById(appId)
                    .filter(app -> app.getStatus() == PublishStatus.UNPUBLISHED)
                    .ifPresent(app -> store.deletePointer(slug));
        } catch (RuntimeException e) {
            log.warn("Couldn't discard the cancelled build {} of {}: {}", prefix, slug, e.getMessage());
        }
    }

    String tail(String text) {
        if (text == null || text.isBlank()) return null;
        String clean = ANSI_CODES.matcher(text).replaceAll("").strip();
        int max = properties.logMaxChars();
        return clean.length() <= max ? clean : "..." + clean.substring(clean.length() - max);
    }

    private static void sleep(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for a build machine", e);
        }
    }
}
