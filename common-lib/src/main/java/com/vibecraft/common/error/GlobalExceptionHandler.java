package com.vibecraft.common.error;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationCredentialsNotFoundException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.List;

/**
 * One error shape ({@link ApiError}) for every service. Registered automatically via
 * {@code CommonLibAutoConfiguration} — a service doesn't need to import this itself.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        List<ApiError.ApiFieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> new ApiError.ApiFieldError(fe.getField(), fe.getDefaultMessage()))
                .toList();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(new ApiError(HttpStatus.BAD_REQUEST, "Validation failed.", errors));
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiError> handleBadRequest(BadRequestException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(new ApiError(HttpStatus.BAD_REQUEST, ex.getMessage()));
    }

    @ExceptionHandler({AuthenticationException.class, AuthenticationCredentialsNotFoundException.class})
    public ResponseEntity<ApiError> handleUnauthenticated(Exception ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError(HttpStatus.UNAUTHORIZED, ex.getMessage()));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiError> handleForbidden(ForbiddenException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ApiError(HttpStatus.FORBIDDEN, ex.getMessage()));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(HttpStatus.NOT_FOUND, ex.getMessage()));
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiError> handleConflict(ConflictException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError(HttpStatus.CONFLICT, ex.getMessage()));
    }

    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<ApiError> handleQuotaExceeded(QuotaExceededException ex) {
        QuotaDetails quota = new QuotaDetails(ex.reason().name(), ex.limit(), ex.used());
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED)
                .body(new ApiError(HttpStatus.PAYMENT_REQUIRED, ex.getMessage(), quota));
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ApiError> handleRateLimited(RateLimitExceededException ex) {
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .body(new ApiError(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage()));
    }

    @ExceptionHandler({ExternalServiceException.class, FileStorageException.class})
    public ResponseEntity<ApiError> handleUpstreamFailure(RuntimeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(new ApiError(HttpStatus.BAD_GATEWAY, ex.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong on our end."));
    }
}
