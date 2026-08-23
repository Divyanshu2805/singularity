package com.vibecraft.workspace.dto.revision;

import java.util.List;

/**
 * What restoring to a given revision would change, computed purely from stored path/hash manifests - no MinIO
 * reads needed for the comparison itself.
 */
public record RevisionPreviewResponse(Long revisionId, List<RevisionFileChange> changes) {
}
