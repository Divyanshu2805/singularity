package com.singularity.workspace.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * The bounds on type-checking a build turn's files in the project's running preview.
 *
 * <p>Handles: whether the check runs at all, how long it may take in total, how many files a turn may hand over and
 * how large they may be together, how many problems are reported back, and how many newly added packages are looked
 * up in the registry.
 *
 * <p>Every bound exists because the check sits between a finished reply and its save, in a pod that is also serving
 * the person's preview on one CPU. A check that ran long would be a build that felt stuck, so past the time limit the
 * turn is saved unchecked. Every value has a default, so a deployment that sets none behaves sensibly.
 */
@ConfigurationProperties(prefix = "preview.check")
public record CodeCheckProperties(
        Boolean enabled,
        Duration timeout,
        Integer maxFiles,
        Integer maxTotalChars,
        Integer maxProblems,
        Integer maxNewPackages
) {

    public CodeCheckProperties {
        enabled = enabled == null || enabled;
        timeout = timeout == null ? Duration.ofSeconds(40) : timeout;
        maxFiles = maxFiles == null ? 80 : maxFiles;
        maxTotalChars = maxTotalChars == null ? 600_000 : maxTotalChars;
        maxProblems = maxProblems == null ? 12 : maxProblems;
        maxNewPackages = maxNewPackages == null ? 8 : maxNewPackages;
    }

    public static CodeCheckProperties defaults() {
        return new CodeCheckProperties(null, null, null, null, null, null);
    }
}
