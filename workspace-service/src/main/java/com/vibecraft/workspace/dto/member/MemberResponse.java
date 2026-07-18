package com.vibecraft.workspace.dto.member;

import com.vibecraft.workspace.enums.ProjectRole;

import java.time.Instant;

public record MemberResponse(
        Long userId,
        String username,
        String name,
        ProjectRole role,
        Instant invitedAt,
        Instant acceptedAt
) {
}
