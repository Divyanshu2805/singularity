package com.singularity.intelligence.dto.code;

import java.time.Instant;

/**
 * One term of the caller's glossary, as the glossary page lists it.
 *
 * <p>Handles: the term, its kept definition, when it was written, and the id that "remove this term" deletes.
 */
public record GlossaryEntryResponse(
        Long id,
        String term,
        String definition,
        Instant createdAt
) {
}
