package com.vibecraft.common.error;

import lombok.Getter;

/** No row/object matches the given identifier (404) — {@code GlobalExceptionHandler} builds the message from both fields. */
@Getter
public class ResourceNotFoundException extends RuntimeException {

    private final String resourceName;
    private final String resourceId;

    public ResourceNotFoundException(String resourceName, String resourceId) {
        this.resourceName = resourceName;
        this.resourceId = resourceId;
    }
}
