package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.auth.UserProfileResponse;
import com.vibecraft.account.entity.User;
import org.mapstruct.Mapper;

/**
 * Turns a user row into the profile shape the app reads.
 *
 * <p>Handles: the id, username and name only - nothing security-relevant leaves the entity this way.
 */
@Mapper(componentModel = "spring")
public interface UserMapper {

    UserProfileResponse toUserProfileResponse(User user);
}
