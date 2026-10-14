package com.singularity.intelligence.service;

/**
 * What intelligence-service holds about one account, removed when the account is deleted.
 *
 * <p>Handles: deleting every chat, note, tour, glossary word and usage record of the account.
 *
 * <p>Called only by account-service, through the internal API, while it deletes an account. Running it twice does
 * nothing the second time, so account-service can repeat a deletion that failed part way.
 */
public interface UserDataService {

    void deleteAllFor(Long userId);
}
