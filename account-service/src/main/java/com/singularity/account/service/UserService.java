package com.singularity.account.service;

import com.singularity.account.dto.auth.UserProfileResponse;

/**
 * The signed-in user's own profile.
 *
 * <p>Handles: reading it.
 */
public interface UserService {
    UserProfileResponse getProfile();
}
