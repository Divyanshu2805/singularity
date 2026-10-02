package com.singularity.account.service.impl;

import com.singularity.account.dto.auth.UserProfileResponse;
import com.singularity.account.entity.User;
import com.singularity.account.mapper.UserMapper;
import com.singularity.account.repository.UserRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.account.service.UserService;
import com.singularity.common.error.ResourceNotFoundException;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.stereotype.Service;

/**
 * Serves the signed-in user's own profile.
 *
 * <p>Handles: resolving the caller's id from the security context and mapping their row to the profile shape.
 */
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class UserServiceImpl implements UserService {

    UserRepository userRepository;
    AuthUtil authUtil;
    UserMapper userMapper;

    @Override
    public UserProfileResponse getProfile() {
        Long userId = authUtil.getCurrentUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString()));
        return userMapper.toUserProfileResponse(user);
    }
}
