package com.vibecraft.workspace.mapper;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.entity.ProjectMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

/**
 * Turns a membership row plus the user it refers to into one member response.
 *
 * <p>Handles: pulling the id and role from the membership and the email and name from the user.
 *
 * <p>It takes the user as a second argument because a membership has no user relation - that half comes from
 * account-service over the internal API, not from a local join.
 */
@Mapper(componentModel = "spring")
public interface ProjectMemberMapper {

    @Mapping(target = "userId", source = "member.id.userId")
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "name", source = "user.name")
    @Mapping(target = "role", source = "member.projectRole")
    MemberResponse toMemberResponse(ProjectMember member, UserDto user);
}
