package com.singularity.workspace.service.impl;

import com.singularity.workspace.repository.ProjectInviteRepository;
import com.singularity.workspace.service.GitHubService;
import com.singularity.workspace.service.ProjectService;
import com.singularity.workspace.service.UserDataService;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * Removes what workspace-service holds about an account that is being deleted.
 *
 * <p>Handles: the account's projects - each one it owns deleted for everyone, with its previews stopped and its
 * published app taken down, and each one it was invited to left - through ProjectService, the same path as deleting
 * or leaving one by hand; the invitations sent to its address or by it; and its GitHub connection, which GitHub is
 * asked to forget.
 *
 * <p>It is one transaction, but stopping a preview and taking down a published app reach outside the database and are
 * not rolled back with it. That is harmless: a failure leaves the rows as they were, account-service stops and keeps
 * the account, and the next attempt deletes them, finding the previews already stopped and the apps already down.
 * The address is lower-cased because invitations are stored lower-cased.
 *
 * <p>A deleted project is a soft delete like any other, so its files stay in storage as every deleted project's do
 * (docs/known-gaps); nothing in the app can reach them again.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class UserDataServiceImpl implements UserDataService {

    ProjectService projectService;
    ProjectInviteRepository projectInviteRepository;
    GitHubService gitHubService;

    @Override
    @Transactional
    public void deleteAllFor(Long userId, String email) {
        projectService.removeAllForUser(userId);
        int invites = projectInviteRepository.deleteSentToOrBy(email == null ? "" : email.toLowerCase(Locale.ROOT), userId);
        gitHubService.forgetConnection(userId);
        log.info("Deleted the workspace data of user {} ({} invitations)", userId, invites);
    }
}
