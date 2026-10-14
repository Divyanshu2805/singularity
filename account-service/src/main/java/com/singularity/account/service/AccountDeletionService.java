package com.singularity.account.service;

import com.singularity.account.dto.auth.DeleteAccountRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Deleting the signed-in account and everything in it.
 *
 * <p>Handles: confirming the person signed in again moments ago, then removing their data from every service, ending
 * their subscription, deleting their sign-in and ending every session they have.
 */
public interface AccountDeletionService {

    void deleteAccount(DeleteAccountRequest request, HttpServletResponse httpResponse);
}
