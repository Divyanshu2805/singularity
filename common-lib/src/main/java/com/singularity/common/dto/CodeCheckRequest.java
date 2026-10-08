package com.singularity.common.dto;

import java.util.List;
import java.util.Map;

/**
 * The files a build turn is about to save, sent to workspace-service to be type-checked before they are.
 *
 * <p>Handles: carrying each written file whole, by its project path, and the paths the turn deletes. Together with
 * the project as it is stored they describe the project as the turn would leave it, which is what gets checked.
 */
public record CodeCheckRequest(
        Map<String, String> files,
        List<String> deleted
) {
}
