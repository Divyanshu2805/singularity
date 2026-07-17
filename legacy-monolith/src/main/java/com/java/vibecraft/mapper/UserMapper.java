package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.auth.SignupRequest;
import com.java.vibecraft.dto.auth.UserProfileResponse;
import com.java.vibecraft.entity.User;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UserMapper {

    User toEntity(SignupRequest signupRequest);

    UserProfileResponse toUserProfileResponse(User user);
}
