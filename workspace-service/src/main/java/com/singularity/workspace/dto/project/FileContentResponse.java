package com.singularity.workspace.dto.project;

/**
 * One project file's path and full text.
 *
 * <p>Handles: both, with the path in its canonical stored form, and the SHA-256 of the stored bytes. The hash is what
 * a save by hand sends back as the version it was made against, so a tab that has fallen behind cannot write over
 * newer content; it is null where a caller builds the response without reading storage.
 */
public record FileContentResponse(
        String path,
        String content,
        String hash
) {
    public FileContentResponse(String path, String content) {
        this(path, content, null);
    }
}
