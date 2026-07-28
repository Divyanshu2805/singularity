package com.vibecraft.common.error;

import lombok.Getter;

/**
 * No row or object matches the given identifier.
 *
 * <p>Handles: a 404 whose message GlobalExceptionHandler builds from the resource name and id.
 */
@Getter
public class ResourceNotFoundException extends RuntimeException {

    private final String resourceName;
    private final String resourceId;

    public ResourceNotFoundException(String resourceName, String resourceId) {
        this.resourceName = resourceName;
        this.resourceId = resourceId;
    }
}
