package com.singularity.account.controller;

import com.singularity.account.dto.auth.AuthAuditEventResponse;
import com.singularity.account.dto.auth.CreateSessionRequest;
import com.singularity.account.dto.auth.DeleteAccountRequest;
import com.singularity.account.dto.auth.ReportSecurityEventRequest;
import com.singularity.account.dto.auth.SessionResponse;
import com.singularity.account.dto.auth.UserProfileResponse;
import com.singularity.account.service.AccountDeletionService;
import com.singularity.account.service.SessionService;
import com.singularity.account.service.UserService;
import com.singularity.common.security.DemoAccount;
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
 * Firebase - and deleting the account, which needs a sign-in made moments before (AccountDeletionServiceImpl).
 *
 * <p>Signing in, signing up, Google, second factors and password resets all happen between the browser and Firebase;
 * this controller only turns the result into a session and ends it again.
 *
 * <p>The shared demo account cannot sign every device out or delete itself (DemoAccount): either would end it for
 * whoever else is using it.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class AuthController {

    SessionService sessionService;
    UserService userService;
    AccountDeletionService accountDeletionService;
    DemoAccount demoAccount;

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
        demoAccount.refuseCurrent();
        sessionService.signOutEverywhere(httpRequest, httpResponse);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/account/delete")
    public ResponseEntity<Void> deleteAccount(@RequestBody @Valid DeleteAccountRequest request, HttpServletResponse httpResponse) {
        demoAccount.refuseCurrent();
        accountDeletionService.deleteAccount(request, httpResponse);
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
