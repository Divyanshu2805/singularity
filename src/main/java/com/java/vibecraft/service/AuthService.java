package com.java.vibecraft.service;

import com.java.vibecraft.dto.auth.AuthResponse;
import com.java.vibecraft.dto.auth.LoginRequest;
import com.java.vibecraft.dto.auth.SignupRequest;
import com.java.vibecraft.security.ClientInfo;

/** Legacy (app.auth.legacy.enabled) username/password auth with Bearer tokens. Firebase sign-ins use SessionService. */
public interface AuthService {
    AuthResponse signup(SignupRequest request, ClientInfo client);

    AuthResponse login(LoginRequest request, ClientInfo client);
}
