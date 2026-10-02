package com.singularity.account.mapper;

import com.singularity.account.dto.auth.UserProfileResponse;
import com.singularity.account.entity.User;
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
