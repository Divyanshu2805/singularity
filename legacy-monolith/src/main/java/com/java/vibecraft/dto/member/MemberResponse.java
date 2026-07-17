package com.java.vibecraft.dto.member;

import com.java.vibecraft.enums.ProjectRole;

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
