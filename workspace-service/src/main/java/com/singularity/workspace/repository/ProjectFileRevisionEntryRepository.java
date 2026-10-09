package com.singularity.workspace.repository;

import com.singularity.workspace.entity.ProjectFileRevisionEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

/**
 * Reads and writes revision manifest entries.
 *
 * <p>Handles: one revision's entries, and the entries of many revisions in one query, for a history list that names
 * what each revision changed.
 */
public interface ProjectFileRevisionEntryRepository extends JpaRepository<ProjectFileRevisionEntry, Long> {

    List<ProjectFileRevisionEntry> findByRevisionId(Long revisionId);

    List<ProjectFileRevisionEntry> findByRevisionIdIn(Collection<Long> revisionIds);
}
