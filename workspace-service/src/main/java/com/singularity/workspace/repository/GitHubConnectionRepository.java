package com.singularity.workspace.repository;

import com.singularity.workspace.entity.GitHubConnection;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Stores each person's connection to GitHub, one row per user.
 *
 * <p>Handles: reading, replacing and removing a connection by the user's id. Saving one with an id that already has a
 * row replaces it, which is what connecting again should do.
 */
public interface GitHubConnectionRepository extends JpaRepository<GitHubConnection, Long> {
}
