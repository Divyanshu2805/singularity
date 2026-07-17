package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.auth.SignupRequest;
import com.vibecraft.account.dto.auth.UserProfileResponse;
import com.vibecraft.account.entity.User;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UserMapper {

    User toEntity(SignupRequest signupRequest);

    UserProfileResponse toUserProfileResponse(User user);
}
