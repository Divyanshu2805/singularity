package com.vibecraft.workspace.security;

import org.springframework.security.core.GrantedAuthority;

import java.util.List;

/**
 * The signed-in caller, as every controller and service sees it (through {@link AuthUtil#getCurrentUserId()}).
 *
 * @param firebaseUid null for a request authenticated with a legacy Bearer token
 */
public record UserPrincipal(
        Long userId,
        String username,
        String firebaseUid,
        List<GrantedAuthority> authorities
) {
}
