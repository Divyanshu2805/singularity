package com.vibecraft.workspace.dto.project;

import java.util.List;

/**
 * A project's ZIP export, alongside whether it actually contains everything.
 *
 * <p>Handles: the ZIP bytes and the paths, if any, that a listed file's metadata pointed at but object storage no
 * longer had - a mismatch that should never happen, but silently shipping a ZIP missing those files under the same
 * "complete" appearance as a real one would hide exactly the case worth surfacing.
 */
public record ProjectZipResult(byte[] bytes, List<String> missingPaths) {
    public boolean isComplete() {
        return missingPaths.isEmpty();
    }
}
