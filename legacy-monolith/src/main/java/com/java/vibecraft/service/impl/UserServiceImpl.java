package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.auth.UserProfileResponse;
import com.java.vibecraft.entity.User;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.mapper.UserMapper;
import com.java.vibecraft.repository.UserRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.UserService;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class UserServiceImpl implements UserService, UserDetailsService {

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

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {

        return userRepository.findByUsername(username).orElseThrow(() ->
                new UsernameNotFoundException("User not found with username: " + username));
    }
}
