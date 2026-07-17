package com.vibecraft.common.dto;

/**
 * account-service's view of a user, as served over its internal API. Stands in for the {@code User}
 * @Entity so a caller in another service never needs it as a JPA-mapped association — see the migration
 * plan's decision on cross-service entity references.
 */
public record UserDto(
        Long id,
        String username,
        String name,
        String firebaseUid
) {
}
