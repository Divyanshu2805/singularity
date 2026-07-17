package com.vibecraft.common.error;

/** A dependency this service calls (Firebase, Stripe, OpenRouter, another internal service via Feign) failed. */
public class ExternalServiceException extends RuntimeException {
    public ExternalServiceException(String message, Throwable cause) {
        super(message, cause);
    }

    public ExternalServiceException(String message) {
        super(message);
    }
}
