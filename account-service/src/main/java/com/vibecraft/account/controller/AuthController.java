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
 * Sessions for Firebase sign-ins. Signing in, signing up, Google, second factors and password resets all happen
 * between the browser and Firebase; this controller only turns the result into a session and ends it again.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class AuthController {

    SessionService sessionService;
    UserService userService;

    /**
     * Makes sure the browser holds a CSRF token (the readable {@code XSRF-TOKEN} cookie) before its first write.
     * Resolving the token is what makes Spring write the cookie.
     */
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
