package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.dto.auth.CreateSessionRequest;
import com.vibecraft.account.dto.auth.ReportSecurityEventRequest;
import com.vibecraft.account.dto.auth.SessionResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.List;

public interface SessionService {

    /**
     * Exchanges a fresh Firebase ID token for this app's httpOnly session cookie, creating or linking the local
     * account on first sign-in.
     */
    SessionResponse createSession(CreateSessionRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    /** Ends this device's session. Always succeeds, signed in or not. */
    void signOut(HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    /** Ends every session of the current user, on every device, including this one. */
    void signOutEverywhere(HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    void reportSecurityEvent(ReportSecurityEventRequest request, HttpServletRequest httpRequest);

    List<AuthAuditEventResponse> recentSecurityEvents();
}
