package com.java.vibecraft.dto.chat;

import java.util.List;

/**
 * What the latest saved turn changed, with each file's version from before it - enough for the editor to rebuild that
 * turn's diffs on any page load, after a refresh or signing out and back in.
 */
public record LastTurnChangesResponse(List<FileChange> files) {

    /** @param previousContent the file before the turn; empty when the turn created it */
    public record FileChange(String path, String previousContent) {
    }
}
