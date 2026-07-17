package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.ForgotPasswordRequest;
import com.vibecraft.account.dto.auth.ResetPasswordRequest;
import com.vibecraft.account.security.ClientInfo;

/** Legacy (app.auth.legacy.enabled) password reset - Firebase accounts reset through Firebase's own emails. */
public interface PasswordResetService {

    /** Emails a reset link if the account exists. Behaves identically either way, so it can't be used to probe for accounts. */
    void requestReset(ForgotPasswordRequest request, ClientInfo client);

    void resetPassword(ResetPasswordRequest request, ClientInfo client);
}
