package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.auth.AuthResponse;
import com.java.vibecraft.dto.auth.LoginRequest;
import com.java.vibecraft.dto.auth.SignupRequest;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.enums.AuthAuditEventType;
import com.java.vibecraft.error.BadRequestException;
import com.java.vibecraft.mapper.UserMapper;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.security.ClientInfo;
import com.java.vibecraft.service.AuthAuditService;
import com.java.vibecraft.service.AuthService;
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
            throw new BadRequestException("User already exists with username: "+request.username());
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
