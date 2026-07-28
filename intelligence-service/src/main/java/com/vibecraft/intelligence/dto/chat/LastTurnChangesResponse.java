package com.vibecraft.intelligence.dto.chat;

import java.util.List;

/**
 * What the latest saved turn changed, with each file's version from before it.
 *
 * <p>Handles: enough for the editor to rebuild that turn's diffs on any page load - after a refresh, or after signing
 * out and back in.
 */
public record LastTurnChangesResponse(List<FileChange> files) {

    public record FileChange(String path, String previousContent) {
    }
}
