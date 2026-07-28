package com.vibecraft.common.dto;

/**
 * account-service's view of a user, as it crosses its internal API.
 *
 * <p>Handles: standing in for the User entity so a caller in another service never needs it as a JPA association.
 * Cross-service references are plain ids, resolved over the internal API.
 */
public record UserDto(
        Long id,
        String username,
        String name,
        String firebaseUid
) {
}
