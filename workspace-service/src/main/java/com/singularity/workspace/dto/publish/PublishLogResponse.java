package com.singularity.workspace.dto.publish;

/**
 * The output of the last failed build.
 *
 * <p>Handles: the tail of what the install and the build printed, with colour codes removed; null when there is none.
 */
public record PublishLogResponse(String log) {
}
