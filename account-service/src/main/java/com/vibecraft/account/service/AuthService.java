package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.AuthResponse;
import com.vibecraft.account.dto.auth.LoginRequest;
import com.vibecraft.account.dto.auth.SignupRequest;
import com.vibecraft.account.security.ClientInfo;

/** Legacy (app.auth.legacy.enabled) username/password auth with Bearer tokens. Firebase sign-ins use SessionService. */
public interface AuthService {
    AuthResponse signup(SignupRequest request, ClientInfo client);

    AuthResponse login(LoginRequest request, ClientInfo client);
}
