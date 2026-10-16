package com.singularity.account.mapper;

import com.singularity.account.dto.auth.UserProfileResponse;
import com.singularity.account.entity.User;
import com.singularity.common.security.DemoAccount;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Turns a user row into the profile shape the app reads.
 *
 * <p>Handles: the id, username and name, and whether this is the shared demo account - which the app reads to hide
 * the settings that account cannot use. Nothing security-relevant leaves the entity this way.
 */
@Mapper(componentModel = "spring")
public abstract class UserMapper {

    @Autowired
    protected DemoAccount demoAccount;

    @Mapping(target = "demo", expression = "java(demoAccount.isUid(user.getFirebaseUid()))")
    public abstract UserProfileResponse toUserProfileResponse(User user);
}
