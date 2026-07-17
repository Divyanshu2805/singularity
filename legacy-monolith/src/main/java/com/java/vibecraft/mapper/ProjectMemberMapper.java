package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.member.MemberResponse;
import com.java.vibecraft.entity.ProjectMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ProjectMemberMapper {

    @Mapping(target = "userId", source = "user.id")
    @Mapping(target = "username", source = "user.username")
    @Mapping(target = "name", source = "user.name")
    @Mapping(target = "role", source = "projectRole")
    MemberResponse toProjectMemberResponseFromMember(ProjectMember projectMember);
}
