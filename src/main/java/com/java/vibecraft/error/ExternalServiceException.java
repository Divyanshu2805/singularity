package com.java.vibecraft.error;

/**
 * A third party this request depends on (Google's token endpoint or key set) failed or was unreachable - not the
 * caller's fault, so a 502 rather than a 400. Keeps its cause, like {@link FileStorageException}, for the log.
 */
public class ExternalServiceException extends RuntimeException {

    public ExternalServiceException(String message, Throwable cause) {
        super(message, cause);
    }
}
