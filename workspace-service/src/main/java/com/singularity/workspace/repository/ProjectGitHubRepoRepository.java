package com.singularity.workspace.repository;

import com.singularity.workspace.entity.ProjectGitHubRepo;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Stores which GitHub repository each project has been pushed to, one row per project.
 *
 * <p>Handles: reading, writing and removing the link by the project's id.
 */
public interface ProjectGitHubRepoRepository extends JpaRepository<ProjectGitHubRepo, Long> {
}
