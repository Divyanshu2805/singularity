package com.singularity.intelligence.dto.code;

import java.time.Instant;

/**
 * The tour kept for the caller on a project.
 *
 * <p>Handles: the text and when it was last written, so the panel can say how old it is.
 */
public record TourResponse(
        String content,
        Instant writtenAt
) {
}
