package com.vibecraft.common.error;

/** No row/object matches the given identifier (404). */
public class ResourceNotFoundException extends RuntimeException {
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
