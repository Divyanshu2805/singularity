package com.vibecraft.account.service.impl;

import com.vibecraft.account.dto.auth.UserProfileResponse;
import com.vibecraft.account.entity.User;
import com.vibecraft.account.mapper.UserMapper;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.security.AuthUtil;
import com.vibecraft.account.service.UserService;
import com.vibecraft.common.error.ResourceNotFoundException;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.stereotype.Service;

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
