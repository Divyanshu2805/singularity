package com.singularity.workspace.service.impl;

import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.config.PreviewProperties;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectFilesChanged;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import com.singularity.workspace.util.PreviewFailureExplainer;
import com.singularity.workspace.util.PreviewFailureExplainer.Explained;
import io.fabric8.kubernetes.api.model.Pod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static com.singularity.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;
import static com.singularity.workspace.service.impl.PreviewRunnerPool.SYNCER_CONTAINER;

/**
 * Takes a preview from nothing to a serving dev server, off the request thread.
 *
 * <p>Handles: waiting in line for a runner when every one was busy, mirroring the project's files into the pod and
 * leaving a watch running so later edits land there too, starting npm install and then Vite as one detached process
 * group, polling until the dev server answers, and publishing the route only once it does. Progress is written to the
 * preview row for the Preview tab to poll, and each failure mode - the sync, the install, the dev server, the timeout,
 * no runner coming free - is recorded with its kind, one plain sentence and the runner's own output.
 *
 * <p>Two containers share the app directory: the syncer mirrors the project's objects into it and keeps watching, so
 * every file the AI saves hot-reloads; the runner runs npm. Everything long-running is started detached, because an
 * exec session ends when its shell does and the process tree has to outlive it. The mirror excludes node_modules,
 * which exists only in the pod and would otherwise be wiped as extraneous.
 *
 * <p>The route is published before the status flips to running, because the tab loads the URL the moment it sees that
 * status and must not get a 404.
 *
 * <p>The line. A start that found no idle runner has a row with no pod. It asks for one every couple of seconds and
 * takes the first that comes free, oldest waiter first: a waiter claims only when nobody with a fresh heartbeat is
 * ahead of it, so the order holds across instances without any of them holding a lock. A waiter that Stop ended
 * while it was claiming hands the pod straight back. Waiting is bounded by {@code preview.queue-timeout}; past it the
 * start fails as a capacity failure, which the browser does not retry by itself - it has already waited.
 *
 * <p>Which revision a start is running. The project's current revision is read before the files are copied and
 * recorded on the row as the status flips to running; anything published after that read is the synchronizer's to
 * apply, and it is asked to look the moment the preview is up, so a change saved mid-start is not left for the
 * minute-long sweep. Every start copies the files, a restart included, because a restart is asked for exactly when
 * the files in the pod are in doubt.
 *
 * <p>One writer at a time. A copy ({@link #mirrorOnce}) stops the watcher, mirrors the project once under a time
 * limit of its own, and starts the watcher again, all in one command. The copy used to run beside the watcher, and
 * on a real cluster one such copy in seven hung until the exec gave up two minutes later, on the first change both
 * of them wanted to write. An exec that times out does not stop the command it started, so the limit is inside the
 * script: a copy that hangs is killed there, and the watcher is started again whatever the copy did. A side effect
 * worth having: every copy leaves a fresh watcher, so one that had died quietly is replaced without waiting for the
 * reaper to notice.
 *
 * <p>The checksum of the package.json that was installed is left in the runner, so a later change to the project can
 * be told apart from one that needs its packages installed again ({@link #dependenciesChanged}). A runner started by
 * a version of this service from before that file existed has none, and is treated as unchanged rather than bounced
 * on its first edit.
 *
 * <p>{@link #checkHealth} answers the question a pod's phase cannot (CODE_REVIEW.md PRE-06): a pod stays Running long
 * after the dev server inside it has crashed or gone unresponsive, or after the file-sync watcher has died and left
 * later edits never reaching it. The reaper calls it periodically on every RUNNING preview and decides what to do
 * with the answer - this class only reports what it finds.
 *
 * <p>Every step of a bootstrap - claiming it, each turn in the line and each poll while waiting for the dev server -
 * touches the preview's bootstrap heartbeat (CODE_REVIEW.md PRE-03), so another instance's startup can tell this one
 * is still actively driving the row rather than having crashed mid-bootstrap.
 *
 * <p>Publishing the route is tried several times before the start is given up on. By then the install has been paid
 * for and the dev server is answering, and the router being unreachable for a moment - Redis restarting, or the local
 * port-forward being re-opened after its pod was replaced - is over within seconds; failing there threw a working
 * preview away and left the person to press Try again.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PreviewBootstrapper {

    static final String WAITING_FOR_RUNNER = "Waiting for a free runner";
    static final String STARTING_RUNNER = "Starting a runner";
    static final Duration WAITER_FRESHNESS = Duration.ofSeconds(30);

    private static final Duration SYNC_TIMEOUT = Duration.ofMinutes(2);
    private static final int COPY_LIMIT_SECONDS = 45;
    private static final Duration QUICK_COMMAND_TIMEOUT = Duration.ofSeconds(30);
    private static final Duration HEALTH_CHECK_TIMEOUT = Duration.ofSeconds(10);
    private static final int ROUTE_PUBLISH_ATTEMPTS = 15;

    private static final String MIRROR_FLAGS = "--overwrite --remove --quiet --exclude 'node_modules/*'";

    private final PreviewRepository previewRepository;
    private final ProjectRepository projectRepository;
    private final PreviewRunnerPool runnerPool;
    private final PreviewRouter router;
    private final PreviewLifecycle lifecycle;
    private final PreviewProperties properties;
    private final InstanceId instanceId;
    private final ApplicationEventPublisher events;

    Duration pollInterval = Duration.ofSeconds(2);

    @Async
    public void start(Long previewId, Long projectId) {
        Preview preview = previewRepository.findById(previewId).orElse(null);
        if (preview == null || preview.getStatus() != PreviewStatus.CREATING) return;

        // Claims this bootstrap for this instance (CODE_REVIEW.md PRE-03): a startup on another instance decides
        // whether a CREATING row is still-running work or abandoned by how recently this heartbeat was touched.
        previewRepository.heartbeatBootstrap(previewId, instanceId.value(), Instant.now());

        try {
            if (preview.getPodName() == null) {
                String claimed = waitForRunner(preview, projectId);
                if (claimed == null) return;
                preview.setPodName(claimed);
            }
            String pod = preview.getPodName();

            if (!phase(preview, "Copying project files")) return;
            Long revision = projectRepository.findCurrentFileRevisionId(projectId).orElse(null);
            ExecResult sync = mirrorOnce(projectId, pod);
            if (!sync.succeeded()) {
                lifecycle.fail(preview, PreviewFailureKind.PLATFORM, "Couldn't copy the project's files into the preview", sync.output());
                return;
            }

            if (!phase(preview, "Installing dependencies")) return;
            ExecResult boot = runnerPool.exec(pod, RUNNER_CONTAINER, QUICK_COMMAND_TIMEOUT, bootScript());
            if (!boot.succeeded()) {
                lifecycle.fail(preview, PreviewFailureKind.PLATFORM, "Couldn't start npm in the preview", boot.output());
                return;
            }

            if (waitUntilServing(preview, projectId, revision)) {
                events.publishEvent(new ProjectFilesChanged(projectId));
            }
        } catch (RuntimeException e) {
            log.error("Preview {} for project {} failed while starting", previewId, projectId, e);
            lifecycle.fail(preview, PreviewFailureKind.PLATFORM, "Something went wrong starting the preview", e.getMessage());
        }
    }

    String waitForRunner(Preview preview, Long projectId) {
        Instant deadline = Instant.now().plus(properties.queueTimeout());
        while (true) {
            Instant now = Instant.now();
            if (previewRepository.heartbeatBootstrap(preview.getId(), instanceId.value(), now) == 0) return null;

            if (previewRepository.countWaitingAhead(preview.getId(), now.minus(WAITER_FRESHNESS)) == 0) {
                Optional<Pod> pod = runnerPool.claim(projectId);
                if (pod.isPresent()) {
                    String name = pod.get().getMetadata().getName();
                    if (previewRepository.assignPod(preview.getId(), name, STARTING_RUNNER, Instant.now()) == 0) {
                        runnerPool.release(name);
                        return null;
                    }
                    log.info("Preview {} for project {} left the line for pod {}", preview.getId(), projectId, name);
                    return name;
                }
            }
            if (now.isAfter(deadline)) {
                lifecycle.fail(preview, PreviewFailureKind.CAPACITY, "Every preview runner stayed busy for "
                        + minutes(properties.queueTimeout()) + ". Try again in a little while.", null);
                return null;
            }
            sleep(pollInterval);
        }
    }

    private boolean waitUntilServing(Preview preview, Long projectId, Long revision) {
        Instant deadline = Instant.now().plus(properties.bootTimeout());
        boolean installed = false;

        while (true) {
            sleep(pollInterval);

            PreviewStatus status = previewRepository.findById(preview.getId())
                    .map(Preview::getStatus).orElse(PreviewStatus.TERMINATED);
            if (status != PreviewStatus.CREATING) return false;
            previewRepository.heartbeatBootstrap(preview.getId(), instanceId.value(), Instant.now());

            Probe probe = Probe.parse(runnerPool.exec(preview.getPodName(), RUNNER_CONTAINER,
                    QUICK_COMMAND_TIMEOUT, probeScript()).output());

            if (probe.installExit() != null && probe.installExit() != 0) {
                String output = readLogs(preview.getPodName());
                Explained why = PreviewFailureExplainer.install(output);
                lifecycle.fail(preview, why.kind(), why.detail(), output);
                return false;
            }
            if (!installed && probe.installExit() != null) {
                installed = true;
                if (!phase(preview, "Starting the dev server")) return false;
            }
            if (probe.devExit() != null) {
                String output = readLogs(preview.getPodName());
                Explained why = PreviewFailureExplainer.devServer(output);
                lifecycle.fail(preview, why.kind(), why.detail(), output);
                return false;
            }
            if (probe.serving()) break;
            if (Instant.now().isAfter(deadline)) {
                lifecycle.fail(preview, PreviewFailureKind.TIMEOUT, (installed
                        ? "The app's dev server didn't answer within "
                        : "Installing the project's packages took more than ")
                        + minutes(properties.bootTimeout()) + ".", readLogs(preview.getPodName()));
                return false;
            }
        }

        String podIp = runnerPool.podIp(preview.getPodName()).orElse(null);
        if (podIp == null) {
            lifecycle.fail(preview, PreviewFailureKind.PLATFORM, "The preview runner went away while starting", null);
            return false;
        }
        publishRoute(preview, podIp, pollInterval);
        if (previewRepository.markRunning(preview.getId(), Instant.now(), revision) == 0) {
            router.remove(preview.getHostname());
            return false;
        }
        log.info("Preview {} for project {} is live at {} on revision {}",
                preview.getId(), projectId, preview.getPreviewUrl(), revision);
        return true;
    }

    void publishRoute(Preview preview, String podIp, Duration pause) {
        for (int attempt = 1; ; attempt++) {
            try {
                router.register(preview.getHostname(), podIp);
                return;
            } catch (ExternalServiceException e) {
                if (attempt >= ROUTE_PUBLISH_ATTEMPTS) throw e;
                log.warn("Couldn't publish the route for preview {} (attempt {} of {}), trying again: {}",
                        preview.getId(), attempt, ROUTE_PUBLISH_ATTEMPTS, e.getMessage());
                previewRepository.heartbeatBootstrap(preview.getId(), instanceId.value(), Instant.now());
                sleep(pause);
            }
        }
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

    public ExecResult mirrorOnce(Long projectId, String podName) {
        return runnerPool.exec(podName, SYNCER_CONTAINER, SYNC_TIMEOUT, resyncScript(projectId));
    }

    public boolean dependenciesChanged(String podName) {
        return "changed".equals(lastLine(runnerPool.exec(podName, RUNNER_CONTAINER, QUICK_COMMAND_TIMEOUT, """
                old=$(cat /tmp/installed.pkg 2>/dev/null)
                cur=$(md5sum /app/package.json 2>/dev/null | cut -d' ' -f1)
                if [ -n "$old" ] && [ "$old" != "$cur" ]; then echo changed; else echo same; fi
                """).output()));
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

    private String watchScript(Long projectId) {
        return "nohup mc mirror " + MIRROR_FLAGS + " --watch " + source(projectId)
                + " /app/ > /tmp/sync.log 2>&1 < /dev/null & echo started";
    }

    private String resyncScript(Long projectId) {
        return """
                self=$$
                for f in /proc/[0-9]*/cmdline; do
                  pid=${f#/proc/}
                  pid=${pid%%/cmdline}
                  [ "$pid" = "$self" ] && continue
                  c=$(tr '\\0' ' ' < "$f" 2>/dev/null)
                  case "$c" in
                    *"mc mirror"*) kill "$pid" 2>/dev/null ;;
                  esac
                done
                timeout -k 5 %d mc mirror %s %s /app/
                code=$?
                %s > /dev/null
                exit $code
                """.formatted(COPY_LIMIT_SECONDS, MIRROR_FLAGS, source(projectId), watchScript(projectId));
    }

    /**
     * Scans /proc by hand rather than using pgrep, ps, or grep: the mc image is a minimal image with none of
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
        return "cd /app && rm -f /tmp/install.exit /tmp/dev.exit /tmp/install.log /tmp/dev.log /tmp/installed.pkg && "
                + "setsid sh -c 'echo $$ > /tmp/boot.pid; "
                + "sum=$(md5sum package.json 2>/dev/null | cut -d\" \" -f1); "
                + "npm install --no-audit --no-fund --loglevel=error > /tmp/install.log 2>&1; "
                + "code=$?; echo $code > /tmp/install.exit; [ $code -eq 0 ] || exit 0; "
                + "echo \"$sum\" > /tmp/installed.pkg; "
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
            String[] parts = lastLine(output).split("\\|", -1);
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

    private static String lastLine(String output) {
        String line = output == null ? "" : output.strip();
        int newline = line.lastIndexOf('\n');
        return newline >= 0 ? line.substring(newline + 1).strip() : line;
    }

    private static String minutes(Duration duration) {
        long minutes = Math.max(1, duration.toMinutes());
        return minutes + (minutes == 1 ? " minute" : " minutes");
    }

    private static void sleep(Duration duration) {
        if (duration.isZero() || duration.isNegative()) return;
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for the preview to start", e);
        }
    }
}
