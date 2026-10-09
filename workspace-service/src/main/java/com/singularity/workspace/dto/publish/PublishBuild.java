package com.singularity.workspace.dto.publish;

import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;

import java.time.Instant;

/**
 * The build behind a publish, while it runs or after it failed.
 *
 * <p>Handles: its status, the step under way, when it started, and for a failure its kind and one plain sentence. The
 * output behind a failure is read separately, from the log endpoint, because it is long and only the owner may see it.
 */
public record PublishBuild(
        PublishBuildStatus status,
        String step,
        Instant startedAt,
        PublishFailureKind failureKind,
        String failureMessage
) {
}
