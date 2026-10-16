package com.singularity.account.service;

/**
 * The shared public demo account: made, and put back to how it started, across every service.
 *
 * <p>Handles: making the account from nothing - its Firebase user, its row, and its sample project with that project's
 * first build - and telling whether it exists yet.
 *
 * <p>Running it again is how the account is put back each day: whatever the last visitor did is removed and the
 * sample project made again (DemoAccountServiceImpl).
 */
public interface DemoAccountService {

    void reset();

    boolean exists();
}
