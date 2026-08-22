package com.vibecraft.workspace.service;

import com.vibecraft.workspace.entity.ProjectFileRevision;
import com.vibecraft.workspace.entity.ProjectFileRevisionEntry;

import java.util.List;
import java.util.Optional;

/**
 * A pre-publish check run against a staged, already-manifested revision, before its content is applied to the
 * live layout. No implementation exists yet - this is the extension point CODE_REVIEW.md AI-09 (isolated
 * typecheck/build validation before a generated change is saved, via a disposable K8s-exec workload) hooks into,
 * kept deliberately empty rather than half-built. {@link RevisionPublisher} invokes every registered bean of this
 * type (an empty list today, since Spring injects zero matching beans as an empty {@code List}, not an error) and
 * treats a returned failure message exactly like an apply failure - the same rollback path either way.
 */
public interface RevisionValidator {

    /** Empty if the revision passes; a human-readable reason if it doesn't. */
    Optional<String> validate(ProjectFileRevision revision, List<ProjectFileRevisionEntry> entries);
}
