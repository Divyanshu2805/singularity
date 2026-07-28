package com.vibecraft.common.security;

import org.springframework.security.core.GrantedAuthority;

import java.util.List;

/**
 * The signed-in caller, as every controller and service sees it.
 *
 * <p>Handles: carrying the local user id, the username, and the Firebase uid that every sign-in method resolves to.
 */
public record UserPrincipal(
        Long userId,
        String username,
        String firebaseUid,
        List<GrantedAuthority> authorities
) {
}
