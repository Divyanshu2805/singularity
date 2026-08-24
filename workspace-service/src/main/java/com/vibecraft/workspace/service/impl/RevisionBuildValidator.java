package com.vibecraft.workspace.service.impl;

import com.vibecraft.workspace.config.RevisionValidationProperties;
import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.entity.ProjectFileRevisionEntry;
import com.vibecraft.workspace.service.BlobStore;
import com.vibecraft.workspace.service.RevisionValidator;
import io.fabric8.kubernetes.api.model.Pod;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * CODE_REVIEW.md AI-09: the first real {@link RevisionValidator} - an isolated typecheck/build check that runs a
 * staged revision's exact content inside a freshly claimed, disposable runner pod before it is allowed to publish.
 *
 * <p>Handles: materializing the revision's full snapshot (not just its changed paths) into the pod's {@code /app},
 * running {@code npm install} then the configured check command, and turning a non-zero exit into a readable
 * failure reason. Always claims a brand-new pod rather than reusing an already-serving preview's - that pod's
 * {@code runner} container has no per-process resource isolation, so a concurrent build could starve or OOM-kill a
 * live dev server real users are watching. The claimed pod is always released (deleted, never returned to the
 * warm pool - {@link PreviewRunnerPool#release}), even if validation itself throws.
 *
 * <p>Off by default and fails open when the warm pool has no idle pod to give it - see
 * {@link RevisionValidationProperties}'s javadoc and this class's own log lines for why. What this does not do:
 * a bounded repair loop (the finding marks it optional), structured per-category diagnostics (ADDITIONALS.md
 * IMP-19 - this returns one flat, stage-prefixed string), or reusing a warm {@code node_modules}/npm cache across
 * runs (every run is a cold install, the single largest cost in this design).
 *
 * <p>Depends on {@link RevisionSnapshotReader} directly, not the full {@code RevisionService} - that interface's
 * {@code RevisionServiceImpl} depends on {@code RevisionPublisher}, and {@code RevisionPublisherImpl} depends on
 * every {@code RevisionValidator} bean including this one, which closed a real Spring bean-wiring cycle that only
 * surfaced on an actual boot.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class RevisionBuildValidator implements RevisionValidator {

    private static final Pattern ANSI_CODES = Pattern.compile("\\[[0-9;]*m");

    private final PreviewRunnerPool runnerPool;
    private final RevisionSnapshotReader snapshotReader;
    private final BlobStore blobStore;
    private final RevisionValidationProperties properties;

    @Override
    public Optional<String> validate(ProjectFileRevision revision, List<ProjectFileRevisionEntry> entries) {
        if (!properties.enabled()) {
            return Optional.empty();
        }

        Optional<Pod> claimed = runnerPool.claim(revision.getProjectId());
        if (claimed.isEmpty()) {
            log.warn("No idle runner pod available to validate revision {} for projectId: {} - skipping " +
                    "validation (fail-open) rather than blocking the publish.", revision.getId(), revision.getProjectId());
            return Optional.empty();
        }

        String podName = claimed.get().getMetadata().getName();
        try {
            materialize(podName, snapshotReader.snapshot(revision.getId()));

            PreviewRunnerPool.ExecResult install = runnerPool.exec(podName, PreviewRunnerPool.RUNNER_CONTAINER,
                    properties.installTimeout(), "cd /app && npm install --no-audit --no-fund --loglevel=error");
            if (!install.succeeded()) {
                return Optional.of(diagnostics("npm install failed", install.output()));
            }

            PreviewRunnerPool.ExecResult build = runnerPool.exec(podName, PreviewRunnerPool.RUNNER_CONTAINER,
                    properties.buildTimeout(), "cd /app && " + properties.command());
            if (!build.succeeded()) {
                return Optional.of(diagnostics("Build validation failed", build.output()));
            }
            return Optional.empty();
        } finally {
            runnerPool.release(podName);
        }
    }

    private void materialize(String podName, Map<String, String> snapshot) {
        Set<String> directories = new LinkedHashSet<>();
        for (String path : snapshot.keySet()) {
            int lastSlash = path.lastIndexOf('/');
            if (lastSlash > 0) {
                directories.add("/app/" + path.substring(0, lastSlash));
            }
        }
        if (!directories.isEmpty()) {
            String mkdirScript = "mkdir -p " + String.join(" ", directories.stream().map(d -> "'" + d + "'").toList());
            runnerPool.exec(podName, PreviewRunnerPool.RUNNER_CONTAINER, properties.installTimeout(), mkdirScript);
        }

        snapshot.forEach((path, hash) ->
                runnerPool.uploadFile(podName, PreviewRunnerPool.RUNNER_CONTAINER, "/app/" + path, blobStore.read(hash)));
    }

    /**
     * Stage-prefixed (install vs. build are otherwise indistinguishable - {@code ExecResult.output()} merges
     * stdout+stderr with no signal of which command produced it), ANSI-stripped, and truncated to the
     * configured length keeping the tail - the actual failure is at the end, after install/compile noise, so
     * truncating from the head would hide the one line that matters.
     */
    String diagnostics(String stage, String rawOutput) {
        String clean = ANSI_CODES.matcher(rawOutput == null ? "" : rawOutput).replaceAll("");
        int max = properties.outputMaxChars();
        String body = clean.length() > max ? "..." + clean.substring(clean.length() - max) : clean;
        return stage + ":\n" + body;
    }
}
