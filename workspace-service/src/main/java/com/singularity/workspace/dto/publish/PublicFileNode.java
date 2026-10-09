package com.singularity.workspace.dto.publish;

/**
 * One file of a shared app's code.
 *
 * <p>Handles: the path and the size in bytes.
 */
public record PublicFileNode(String path, long size) {
}
