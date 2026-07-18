package com.vibecraft.workspace.dto.deploy;

/**
 * Recent output from a preview's runner - {@code npm install}, then the Vite dev server.
 *
 * @param live true when read from the running pod just now; false for the tail saved when a start failed (the pod is
 *             gone by then)
 */
public record PreviewLogsResponse(String log, boolean live) {
}
