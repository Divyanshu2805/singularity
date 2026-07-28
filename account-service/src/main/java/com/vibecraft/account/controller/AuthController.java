package com.vibecraft.account.controller;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.dto.auth.CreateSessionRequest;
import com.vibecraft.account.dto.auth.ReportSecurityEventRequest;
import com.vibecraft.account.dto.auth.SessionResponse;
import com.vibecraft.account.dto.auth.UserProfileResponse;
import com.vibecraft.account.service.SessionService;
import com.vibecraft.account.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Sessions for Firebase sign-ins.
 *
 * <p>Handles: handing the browser its CSRF token before its first write, exchanging a Firebase ID token for this
 * app's session cookie, ending this device's session and every session of the user, the signed-in profile read, and
 * the account security trail - both listing it and accepting a client's report of a change it made directly with
 * Firebase.
 *
 * <p>Signing in, signing up, Google, second factors and password resets all happen between the browser and Firebase;
 * this controller only turns the result into a session and ends it again.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class AuthController {

    SessionService sessionService;
    UserService userService;

    @GetMapping("/csrf")
    public ResponseEntity<Void> csrf(CsrfToken csrfToken) {
        csrfToken.getToken();
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/session")
    public ResponseEntity<SessionResponse> createSession(@RequestBody @Valid CreateSessionRequest request,
                                                         HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        return ResponseEntity.ok(sessionService.createSession(request, httpRequest, httpResponse));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        sessionService.signOut(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutEverywhere(HttpServletRequest httpRequest, HttpServletResponse httpResponse) {
        sessionService.signOutEverywhere(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> getProfile() {
        return ResponseEntity.ok(userService.getProfile());
    }

    @GetMapping("/security-events")
    public ResponseEntity<List<AuthAuditEventResponse>> getSecurityEvents() {
        return ResponseEntity.ok(sessionService.recentSecurityEvents());
    }

    @PostMapping("/security-events")
    public ResponseEntity<Void> reportSecurityEvent(@RequestBody @Valid ReportSecurityEventRequest request,
                                                    HttpServletRequest httpRequest) {
        sessionService.reportSecurityEvent(request, httpRequest);
        return ResponseEntity.noContent().build();
    }
}
