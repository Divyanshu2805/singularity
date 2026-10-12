package com.singularity.workspace.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * The GitHub repository a project has been pushed to.
 *
 * <p>Handles: the repository's id and its name, address, default branch and visibility as GitHub last reported them,
 * who made the link, and what was pushed last - the commit, the project revision it holds, and when.
 *
 * <p>One row per project, keyed by the project's id. The repository is the person's own: removing this row forgets
 * the link and nothing more, and no code here deletes a repository. The name is refreshed from GitHub by the
 * repository's id on every push, so one renamed there is still found.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "project_github_repos")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectGitHubRepo {

    @Id
    Long projectId;

    @Column(nullable = false)
    Long pushedBy;

    @Column(nullable = false)
    Long repoId;

    @Column(nullable = false, length = 255)
    String fullName;

    @Column(nullable = false, length = 500)
    String htmlUrl;

    @Column(nullable = false, length = 255)
    String defaultBranch;

    @Column(name = "is_private", nullable = false)
    boolean privateRepo;

    @Column(length = 64)
    String lastCommitSha;

    Long lastPushedRevisionId;

    Instant lastPushedAt;

    @Column(nullable = false)
    Instant createdAt;
}
