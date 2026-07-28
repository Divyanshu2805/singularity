package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.ProjectFile;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes project file metadata.
 *
 * <p>Handles: listing a project's files and finding one by its canonical path. The bytes themselves live in object
 * storage, not here.
 */
public interface ProjectFileRepository extends JpaRepository<ProjectFile, Long> {

    Optional<ProjectFile> findByProjectIdAndPath(Long projectId, String cleanPath);

    List<ProjectFile> findByProjectId(Long projectId);
}
