package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.auth.UserProfileResponse;
import com.vibecraft.account.entity.User;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface UserMapper {

    UserProfileResponse toUserProfileResponse(User user);
}
