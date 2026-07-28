package com.vibecraft.workspace.dto.deploy;

/**
 * Recent output from a preview's runner - npm install, then the Vite dev server.
 *
 * <p>Handles: the text, and whether it was read from the running pod just now or is the tail saved when a start
 * failed, since the pod is gone by then.
 */
public record PreviewLogsResponse(String log, boolean live) {
}
