package com.singularity.workspace.service;

/**
 * What workspace-service holds about one account, removed when the account is deleted.
 *
 * <p>Handles: deleting or leaving every project of the account, deleting the invitations sent to its address or by
 * it, and forgetting its GitHub connection.
 *
 * <p>Called only by account-service, through the internal API, while it deletes an account. Running it twice does
 * nothing the second time, so account-service can repeat a deletion that failed part way.
 */
public interface UserDataService {

    void deleteAllFor(Long userId, String email);
}
