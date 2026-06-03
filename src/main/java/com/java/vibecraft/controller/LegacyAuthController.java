package com.java.vibecraft.controller;

import com.java.vibecraft.dto.auth.AuthResponse;
import com.java.vibecraft.dto.auth.LoginRequest;
import com.java.vibecraft.dto.auth.SignupRequest;
import com.java.vibecraft.security.ClientInfo;
import com.java.vibecraft.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The pre-Firebase username/password endpoints, returning Bearer tokens. A rollback path for the migration only:
 * none of this supports a second factor, so it exists only while {@code app.auth.legacy.enabled} is true - with it
 * false, these routes don't exist at all (404).
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
@ConditionalOnBooleanProperty("app.auth.legacy.enabled")
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class LegacyAuthController {

    AuthService authService;

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@RequestBody @Valid SignupRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(authService.signup(request, ClientInfo.from(httpRequest)));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody @Valid LoginRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(authService.login(request, ClientInfo.from(httpRequest)));
    }
}
