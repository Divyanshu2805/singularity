package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.UserProfileResponse;

/**
 * The signed-in user's own profile.
 *
 * <p>Handles: reading it.
 */
public interface UserService {
    UserProfileResponse getProfile();
}
