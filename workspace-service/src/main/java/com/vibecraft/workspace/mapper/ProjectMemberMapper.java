package com.vibecraft.workspace.mapper;

import com.vibecraft.common.dto.UserDto;
import com.vibecraft.workspace.dto.member.MemberResponse;
import com.vibecraft.workspace.entity.ProjectMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ProjectMemberMapper {

    // ProjectMember has no `user` relation (User lives in account-service's own database) - the username/name
    // half of a MemberResponse comes from a UserDto fetched via AccountServiceClient, not a local JPA join.
    @Mapping(target = "userId", source = "member.id.userId")
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "name", source = "user.name")
    @Mapping(target = "role", source = "member.projectRole")
    MemberResponse toMemberResponse(ProjectMember member, UserDto user);
}
