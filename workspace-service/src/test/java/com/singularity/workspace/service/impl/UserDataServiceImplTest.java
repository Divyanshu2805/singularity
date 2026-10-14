package com.singularity.workspace.service.impl;

import com.singularity.workspace.repository.ProjectInviteRepository;
import com.singularity.workspace.service.GitHubService;
import com.singularity.workspace.service.ProjectService;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * What workspace-service removes for an account being deleted: its projects first, then the invitations sent to its
 * address - matched lower-cased, as they are stored - or by it, then its GitHub connection.
 */
class UserDataServiceImplTest {

    private final ProjectService projectService = mock(ProjectService.class);
    private final ProjectInviteRepository projectInviteRepository = mock(ProjectInviteRepository.class);
    private final GitHubService gitHubService = mock(GitHubService.class);

    private final UserDataServiceImpl service = new UserDataServiceImpl(projectService, projectInviteRepository, gitHubService);

    @Test
    void removesProjectsThenInvitationsThenTheGitHubConnection() {
        service.deleteAllFor(7L, "Someone@Example.com");

        InOrder order = inOrder(projectService, projectInviteRepository, gitHubService);
        order.verify(projectService).removeAllForUser(7L);
        order.verify(projectInviteRepository).deleteSentToOrBy("someone@example.com", 7L);
        order.verify(gitHubService).forgetConnection(7L);
    }

    @Test
    void anAccountWithNoAddressStillLosesWhatItSent() {
        service.deleteAllFor(7L, null);

        verify(projectInviteRepository).deleteSentToOrBy("", 7L);
    }
}
