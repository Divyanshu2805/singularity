package com.vibecraft.common.dto;

/**
 * A project file's path and full text, as it crosses workspace-service's internal API.
 *
 * <p>Handles: both directions with one shape - the read response behind CodeGenerationTools.readFiles and the
 * pre-edit file snapshot, and the write request body behind a generated turn's file edits - since both are just "this
 * path has this content".
 */
public record FileContentDto(
        String path,
        String content
) {
}
