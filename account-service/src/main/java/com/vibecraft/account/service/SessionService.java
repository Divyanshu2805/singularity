package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.dto.auth.CreateSessionRequest;
import com.vibecraft.account.dto.auth.ReportSecurityEventRequest;
import com.vibecraft.account.dto.auth.SessionResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.List;

/**
 * The session lifecycle, from a Firebase sign-in to a sign-out.
 *
 * <p>Handles: exchanging a fresh Firebase ID token for this app's httpOnly session cookie (creating or linking the
 * local account on first sign-in), ending this device's session, ending every session of the user on every device,
 * and both halves of the security trail - recording a client-reported change and listing recent events.
 *
 * <p>Signing out always succeeds, signed in or not, so a stale cookie never leaves someone stuck.
 */
public interface SessionService {

    SessionResponse createSession(CreateSessionRequest request, HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    void signOut(HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    void signOutEverywhere(HttpServletRequest httpRequest, HttpServletResponse httpResponse);

    void reportSecurityEvent(ReportSecurityEventRequest request, HttpServletRequest httpRequest);

    List<AuthAuditEventResponse> recentSecurityEvents();
}
