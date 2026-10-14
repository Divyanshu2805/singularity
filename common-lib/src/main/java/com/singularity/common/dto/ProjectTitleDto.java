package com.singularity.common.dto;

/**
 * A project's title, as it crosses the internal API.
 *
 * <p>Handles: the title a model wrote for a project that had none, sent by intelligence-service, and the title the
 * project holds once workspace-service has answered - which is the caller's only when the project still had none,
 * and otherwise whatever it already had (a rename that landed first). Null when the project has none.
 */
public record ProjectTitleDto(
        String title
) {
}
