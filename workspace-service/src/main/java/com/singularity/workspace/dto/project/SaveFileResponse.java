package com.singularity.workspace.dto.project;

/**
 * What a save by hand left behind.
 *
 * <p>Handles: the file's canonical path, the hash of what is now stored - the base of the next save - and the
 * revision the save was published as, null when the content was already what the file held and nothing was written.
 */
public record SaveFileResponse(
        String path,
        String hash,
        Long revisionId
) {
}
