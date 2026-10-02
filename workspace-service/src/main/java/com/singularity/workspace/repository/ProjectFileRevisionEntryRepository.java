package com.singularity.workspace.repository;

import com.singularity.workspace.entity.ProjectFileRevisionEntry;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Reads and writes one revision's manifest entries.
 */
public interface ProjectFileRevisionEntryRepository extends JpaRepository<ProjectFileRevisionEntry, Long> {

    List<ProjectFileRevisionEntry> findByRevisionId(Long revisionId);
}
