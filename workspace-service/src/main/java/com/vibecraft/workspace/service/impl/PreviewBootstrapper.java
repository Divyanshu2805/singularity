package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.InstanceId;
import com.vibecraft.workspace.config.PreviewProperties;
import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.enums.PreviewStatus;
import com.vibecraft.workspace.repository.PreviewRepository;
import com.vibecraft.workspace.service.impl.PreviewRunnerPool.ExecResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;

import static com.vibecraft.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;
import static com.vibecraft.workspace.service.impl.PreviewRunnerPool.SYNCER_CONTAINER;

/**
 * Takes a claimed pod from nothing to a serving dev server, off the request thread.
 *
 * <p>Handles: mirroring the project's files into the pod and leaving a watch running so later edits land there too,
 * starting npm install and then Vite as one detached process group, polling until the dev server answers, and
 * publishing the route only once it does. Progress is written to the preview row for the Preview tab to poll, and
 * each failure mode - the sync, the install, the dev server, the timeout - is reported with the runner's own output
 * attached.
 *
 * <p>Two containers share the app directory: the syncer mirrors the project's objects into it and keeps watching, so
 * every file the AI saves hot-reloads; the runner runs npm. Everything long-running is started detached, because an
 * exec session ends when its shell does and the process tree has to outlive it. The mirror excludes node_modules,
 * which exists only in the pod and would otherwise be wiped as extraneous.
 *
 * <p>The route is published before the status flips to running, because the tab loads the URL the moment it sees that
 * status and must not get a 404.
 *
 * <p>{@link #checkHealth} answers the question a pod's phase cannot (CODE_REVIEW.md PRE-06): a pod stays Running long
 * after the dev server inside it has crashed or gone unresponsive, or after the file-sync watcher has died and left
 * later edits never reaching it. The reaper calls it periodically on every RUNNING preview and decides what to do
 * with the answer - this class only reports what it finds.
 *
 * <p>Every step of a bootstrap - claiming it and each poll while waiting for the dev server - touches the preview's
 * bootstrap heartbeat (CODE_REVIEW.md PRE-03), so another instance's startup can tell this one is still actively
 * driving the row rather than having crashed mid-bootstrap.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewBootstrapper {

    private static final Duration SYNC_TIMEOUT = Duration.ofMinutes(2);
    private static final Duration QUICK_COMMAND_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration POLL_INTERVAL = Duration.ofSeconds(2);
    private static final Duration HEALTH_CHECK_TIMEOUT = Duration.ofSeconds(10);

    private static final String MIRROR_FLAGS = "--overwrite --remove --quiet --exclude 'node_modules/*'";

    private final PreviewRepository previewRepository;
    private final PreviewRunnerPool runnerPool;
    private final PreviewRouter router;
    private final PreviewLifecycle lifecycle;
    private final PreviewProperties properties;
    private final InstanceId instanceId;

    @Async
    public void start(Long previewId, Long projectId, boolean syncFiles) {
        Preview preview = previewRepository.findById(previewId).orElse(null);
        if (preview == null || preview.getStatus() != PreviewStatus.CREATING) return;

        // Claims this bootstrap for this instance (CODE_REVIEW.md PRE-03): a startup on another instance decides
        // whether a CREATING row is still-running work or abandoned by how recently this heartbeat was touched.
        previewRepository.heartbeatBootstrap(previewId, instanceId.value(), Instant.now());

        String pod = preview.getPodName();
        try {
            if (syncFiles) {
                if (!phase(preview, "Copying project files")) return;
                ExecResult sync = runnerPool.exec(pod, SYNCER_CONTAINER, SYNC_TIMEOUT, syncOnceScript(projectId));
                if (!sync.succeeded()) {
                    lifecycle.fail(preview, "Couldn't copy the project's files into the preview", sync.output());
                    return;
                }
                ExecResult watch = runnerPool.exec(pod, SYNCER_CONTAINER, QUICK_COMMAND_TIMEOUT, watchScript(projectId));
                if (!watch.succeeded()) {
                    lifecycle.fail(preview, "Couldn't start live file sync", watch.output());
                    return;
                }
            }

            if (!phase(preview, "Installing dependencies")) return;
            ExecResult boot = runnerPool.exec(pod, RUNNER_CONTAINER, QUICK_COMMAND_TIMEOUT, bootScript());
            if (!boot.succeeded()) {
                lifecycle.fail(preview, "Couldn't start npm in the preview", boot.output());
                return;
            }

            waitUntilServing(preview, projectId);
        } catch (RuntimeException e) {
            log.error("Preview {} for project {} failed while starting", previewId, projectId, e);
            lifecycle.fail(preview, "Something went wrong starting the preview", e.getMessage());
        }
    }

    private void waitUntilServing(Preview preview, Long projectId) {
        Instant deadline = Instant.now().plus(properties.bootTimeout());
        boolean installed = false;

        while (true) {
            sleep(POLL_INTERVAL);

            PreviewStatus status = previewRepository.findById(preview.getId())
                    .map(Preview::getStatus).orElse(PreviewStatus.TERMINATED);
            if (status != PreviewStatus.CREATING) return;
            previewRepository.heartbeatBootstrap(preview.getId(), instanceId.value(), Instant.now());

            Probe probe = Probe.parse(runnerPool.exec(preview.getPodName(), RUNNER_CONTAINER,
                    QUICK_COMMAND_TIMEOUT, probeScript()).output());

            if (probe.installExit() != null && probe.installExit() != 0) {
                lifecycle.fail(preview, "npm install failed - check package.json", readLogs(preview.getPodName()));
                return;
            }
            if (!installed && probe.installExit() != null) {
                installed = true;
                if (!phase(preview, "Starting the dev server")) return;
            }
            if (probe.devExit() != null) {
                lifecycle.fail(preview, "The dev server stopped while starting", readLogs(preview.getPodName()));
                return;
            }
            if (probe.serving()) break;
            if (Instant.now().isAfter(deadline)) {
                lifecycle.fail(preview, "The preview took more than " + properties.bootTimeout().toMinutes()
                        + " minutes to start", readLogs(preview.getPodName()));
                return;
            }
        }

        String podIp = runnerPool.podIp(preview.getPodName()).orElse(null);
        if (podIp == null) {
            lifecycle.fail(preview, "The preview runner went away while starting", null);
            return;
        }
        router.register(preview.getHostname(), podIp);
        if (previewRepository.markRunning(preview.getId(), Instant.now()) == 0) {
            router.remove(preview.getHostname());
            return;
        }
        log.info("Preview {} for project {} is live at {}", preview.getId(), projectId, preview.getPreviewUrl());
    }

    public record HealthCheck(boolean devServerAlive, boolean serving, boolean watcherAlive) {
    }

    public HealthCheck checkHealth(String podName) {
        Probe probe = Probe.parse(runnerPool.exec(podName, RUNNER_CONTAINER, HEALTH_CHECK_TIMEOUT, probeScript()).output());
        boolean watcherAlive = runnerPool.exec(podName, SYNCER_CONTAINER, HEALTH_CHECK_TIMEOUT, watcherAliveScript()).succeeded();
        return new HealthCheck(probe.devExit() == null, probe.serving(), watcherAlive);
    }

    public boolean restartWatcher(Long projectId, String podName) {
        return runnerPool.exec(podName, SYNCER_CONTAINER, QUICK_COMMAND_TIMEOUT, watchScript(projectId)).succeeded();
    }

    public void stopDevServer(String podName) {
        runnerPool.exec(podName, RUNNER_CONTAINER, QUICK_COMMAND_TIMEOUT,
                "if [ -f /tmp/boot.pid ]; then kill -TERM -$(cat /tmp/boot.pid) 2>/dev/null; fi; sleep 1; true");
    }

    public String readLogs(String podName) {
        return runnerPool.exec(podName, RUNNER_CONTAINER, QUICK_COMMAND_TIMEOUT, """
                if [ -f /tmp/install.log ]; then echo '$ npm install'; tail -n 120 /tmp/install.log; fi
                if [ -f /tmp/dev.log ]; then echo; echo '$ npm run dev'; tail -n 200 /tmp/dev.log; fi
                true
                """).output();
    }

    private boolean phase(Preview preview, String detail) {
        return previewRepository.updatePhase(preview.getId(), detail) > 0;
    }

    private String source(Long projectId) {
        return properties.storageAlias() + "/" + properties.bucket() + "/" + projectId + "/";
    }

    private String syncOnceScript(Long projectId) {
        return "mc mirror " + MIRROR_FLAGS + " " + source(projectId) + " /app/";
    }

    private String watchScript(Long projectId) {
        return "nohup mc mirror " + MIRROR_FLAGS + " --watch " + source(projectId)
                + " /app/ > /tmp/sync.log 2>&1 < /dev/null & echo started";
    }

    /**
     * Scans /proc by hand rather than using pgrep, ps, or grep: quay.io/minio/mc is a minimal image with none of
     * them (only GNU coreutils and mc itself) - caught live re-testing this exact check (CODE_REVIEW.md PRE-06)
     * when the missing binary's "command not found" made every watcher look dead on every single preview. The
     * first, grep-free rewrite had the opposite bug just as badly: matching the shell's own command line, since a
     * `sh -c "<script containing the literal search text>"` process's /proc/self/cmdline contains that text too -
     * every check "found" the pattern in itself and reported alive even with no watcher running at all. Comparing
     * each candidate pid against $$ (this shell's own pid, no subprocess needed) excludes exactly that one process.
     */
    private String watcherAliveScript() {
        return """
                self=$$
                for f in /proc/[0-9]*/cmdline; do
                  pid=${f#/proc/}
                  pid=${pid%/cmdline}
                  [ "$pid" = "$self" ] && continue
                  c=$(tr '\\0' ' ' < "$f" 2>/dev/null)
                  case "$c" in
                    *"mc mirror"*"--watch"*) exit 0 ;;
                  esac
                done
                exit 1
                """;
    }

    private String bootScript() {
        int port = properties.runnerPort();
        return "cd /app && rm -f /tmp/install.exit /tmp/dev.exit /tmp/install.log /tmp/dev.log && "
                + "setsid sh -c 'echo $$ > /tmp/boot.pid; "
                + "npm install --no-audit --no-fund --loglevel=error > /tmp/install.log 2>&1; "
                + "code=$?; echo $code > /tmp/install.exit; [ $code -eq 0 ] || exit 0; "
                + "npm run dev -- --host 0.0.0.0 --port " + port + " --strictPort > /tmp/dev.log 2>&1; "
                + "echo $? > /tmp/dev.exit' > /dev/null 2>&1 < /dev/null & echo started";
    }

    private String probeScript() {
        return "i=$(cat /tmp/install.exit 2>/dev/null); d=$(cat /tmp/dev.exit 2>/dev/null); u=down; "
                + "wget -q -T 3 -O /dev/null http://127.0.0.1:" + properties.runnerPort() + "/@vite/client "
                + "2>/dev/null && u=up; echo \"$i|$d|$u\"";
    }

    record Probe(Integer installExit, Integer devExit, boolean serving) {

        static Probe parse(String output) {
            String line = output == null ? "" : output.strip();
            int newline = line.lastIndexOf('\n');
            if (newline >= 0) line = line.substring(newline + 1);
            String[] parts = line.split("\\|", -1);
            if (parts.length != 3) return new Probe(null, null, false);
            return new Probe(parseInt(parts[0]), parseInt(parts[1]), "up".equals(parts[2].strip()));
        }

        private static Integer parseInt(String value) {
            try {
                return value.isBlank() ? null : Integer.parseInt(value.strip());
            } catch (NumberFormatException e) {
                return null;
            }
        }
    }

    private static void sleep(Duration duration) {
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for the preview to start", e);
        }
    }
}
