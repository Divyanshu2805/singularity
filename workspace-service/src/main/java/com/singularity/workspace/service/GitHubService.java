package com.singularity.workspace.service;

import com.singularity.workspace.dto.github.GitHubConnectResponse;
import com.singularity.workspace.dto.github.GitHubPushRequest;
import com.singularity.workspace.dto.github.GitHubStatusResponse;
import com.singularity.workspace.dto.github.ProjectGitHubResponse;

/**
 * A person's connection to GitHub, and pushing a project to a repository there.
 *
 * <p>Handles: saying whether the caller has connected GitHub, starting and finishing the sign-in that connects it,
 * disconnecting, saying where a project stands with its repository, pushing the project's files as a commit - making
 * the repository the first time - and forgetting the link between a project and its repository.
 */
public interface GitHubService {

    GitHubStatusResponse status();

    GitHubConnectResponse startConnect();

    GitHubStatusResponse completeConnect(String code, String state);

    void disconnect();

    ProjectGitHubResponse projectStatus(Long projectId);

    ProjectGitHubResponse push(Long projectId, GitHubPushRequest request);

    void unlink(Long projectId);
}
