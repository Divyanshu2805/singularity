package com.singularity.workspace.dto.publish;

/**
 * One file of a shared app's code, with its text.
 *
 * <p>Handles: the path, the text (empty for a binary file) and whether the file is binary, in which case the page shows
 * a note instead of garbage.
 */
public record PublicFileContent(String path, String content, boolean binary) {
}
