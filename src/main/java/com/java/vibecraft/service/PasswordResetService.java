package com.java.vibecraft.service;

import com.java.vibecraft.dto.auth.ForgotPasswordRequest;
import com.java.vibecraft.dto.auth.ResetPasswordRequest;
import com.java.vibecraft.security.ClientInfo;

/** Legacy (app.auth.legacy.enabled) password reset - Firebase accounts reset through Firebase's own emails. */
public interface PasswordResetService {

    /** Emails a reset link if the account exists. Behaves identically either way, so it can't be used to probe for accounts. */
    void requestReset(ForgotPasswordRequest request, ClientInfo client);

    void resetPassword(ResetPasswordRequest request, ClientInfo client);
}
