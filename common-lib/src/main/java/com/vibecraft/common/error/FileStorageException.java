package com.vibecraft.common.error;

/**
 * A MinIO read, write or delete failed.
 *
 * <p>Handles: a 503 tagged UPSTREAM_UNAVAILABLE, alongside ExternalServiceException. The object key stays in the log
 * rather than the response.
 */
public class FileStorageException extends RuntimeException {
    public FileStorageException(String message, Throwable cause) {
        super(message, cause);
    }

    public FileStorageException(String message) {
        super(message);
    }
}
