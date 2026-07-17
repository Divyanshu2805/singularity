package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.auth.AuthResponse;
import com.vibecraft.account.dto.auth.LoginRequest;
import com.vibecraft.account.dto.auth.SignupRequest;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.enums.AuthAuditEventType;
import com.vibecraft.account.mapper.UserMapper;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.security.AuthUtil;
import com.vibecraft.account.security.ClientInfo;
import com.vibecraft.account.service.AuthAuditService;
import com.vibecraft.account.service.AuthService;
import com.vibecraft.common.error.BadRequestException;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class AuthServiceImpl implements AuthService {

    UserRepository userRepository;
    UserMapper userMapper;
    PasswordEncoder passwordEncoder;
    AuthUtil authUtil;
    AuthenticationManager authenticationManager;
    AuthAuditService auditService;

    @Override
    public AuthResponse signup(SignupRequest request, ClientInfo client) {

        userRepository.findByUsername(request.username()).ifPresent(user -> {
            throw new BadRequestException("User already exists with username: " + request.username());
        });

        User user = userMapper.toEntity(request);
        user.setPassword(passwordEncoder.encode(request.password()));
        user = userRepository.save(user);

        auditService.record(AuthAuditEventType.LEGACY_SIGN_UP, user.getId(), null, client, null);
        String token = authUtil.generateAccessToken(user);
        return new AuthResponse(token, userMapper.toUserProfileResponse(user));
    }

    @Override
    public AuthResponse login(LoginRequest request, ClientInfo client) {

        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password())
        );

        User user = (User) authentication.getPrincipal();

        auditService.record(AuthAuditEventType.LEGACY_SIGN_IN, user.getId(), user.getFirebaseUid(), client, null);
        String token = authUtil.generateAccessToken(user);
        return new AuthResponse(token, userMapper.toUserProfileResponse(user));
    }
}
