package com.vibecraft.common.error;

import io.jsonwebtoken.JwtException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authorization.AuthorizationDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.List;

/**
 * One error shape ({@link ApiError}) for every service. Registered automatically via
 * {@code CommonLibAutoConfiguration} — a service doesn't need to import this itself. A faithful port of
 * legacy-monolith's own handler (same exception set, same status mapping) — kept in lockstep with it
 * rather than reinvented, since a divergent error taxonomy between services is exactly the kind of subtle
 * regression this migration's reliability strategy exists to avoid.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleResourceNotFound(ResourceNotFoundException ex) {
        ApiError apiError = new ApiError(HttpStatus.NOT_FOUND, ex.getResourceName() + " with id " + ex.getResourceId() + " not found");
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<ApiError> handleForbidden(ForbiddenException ex) {
        ApiError apiError = new ApiError(HttpStatus.FORBIDDEN, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleInputValidationError(MethodArgumentNotValidException ex) {
        List<ApiError.ApiFieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiError.ApiFieldError(error.getField(), error.getDefaultMessage()))
                .toList();
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST, "Input Validation Failed", errors);
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    /**
     * 402 Payment Required - the one status that means "this would work if you paid". Not a 400: the request
     * was perfectly well formed, and not a 403: it isn't a permission problem.
     */
    @ExceptionHandler(QuotaExceededException.class)
    public ResponseEntity<ApiError> handleQuotaExceeded(QuotaExceededException ex) {
        ApiError apiError = new ApiError(HttpStatus.PAYMENT_REQUIRED, ex.getMessage(), ex.toDetails());
        log.warn("Quota exceeded ({}): {} of {} used on plan {}",
                ex.getReason(), ex.getUsed(), ex.getLimit(), ex.getPlanName());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiError> handleConflict(ConflictException ex) {
        ApiError apiError = new ApiError(HttpStatus.CONFLICT, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiError> handleBadRequest(BadRequestException ex) {
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(AuthorizationDeniedException.class)
    public ResponseEntity<ApiError> handleAuthorizationDenied(AuthorizationDeniedException ex) {
        ApiError apiError = new ApiError(HttpStatus.FORBIDDEN, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    /** Missing or mismatched X-XSRF-TOKEN on a write - see WebSecurityConfig's csrf().spa(). */
    @ExceptionHandler(CsrfException.class)
    public ResponseEntity<ApiError> handleCsrf(CsrfException ex) {
        ApiError apiError = new ApiError(HttpStatus.FORBIDDEN, "Your request couldn't be verified. Refresh the page and try again.");
        log.warn("{} (cause: {})", apiError, ex.getMessage());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    /** Any other access-denied from the security chain. Without this it fell through to the catch-all 500. */
    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiError> handleAccessDenied(AccessDeniedException ex) {
        ApiError apiError = new ApiError(HttpStatus.FORBIDDEN, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(RateLimitExceededException.class)
    public ResponseEntity<ApiError> handleRateLimit(RateLimitExceededException ex) {
        ApiError apiError = new ApiError(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(apiError);
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<ApiError> handleAuthenticationFailure(AuthenticationException ex) {
        ApiError apiError = new ApiError(HttpStatus.UNAUTHORIZED, ex.getMessage());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(JwtException.class)
    public ResponseEntity<ApiError> handleJwtError(JwtException ex) {
        ApiError apiError = new ApiError(HttpStatus.UNAUTHORIZED, "Invalid or expired token");
        log.warn("{} (cause: {})", apiError, ex.getMessage());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiError> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST,
                "Invalid value for parameter '" + ex.getName() + "': " + ex.getValue());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiError> handleMissingParameter(MissingServletRequestParameterException ex) {
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST,
                "Missing required parameter '" + ex.getParameterName() + "'");
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleMalformedRequest(HttpMessageNotReadableException ex) {
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST, "Malformed request body");
        log.warn("{} (cause: {})", apiError, ex.getMessage());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        ApiError apiError = new ApiError(HttpStatus.CONFLICT,
                "The request conflicts with existing data (e.g. a duplicate or a reference to something that doesn't exist)");
        log.warn(apiError.toString(), ex);
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler({ExternalServiceException.class, FileStorageException.class})
    public ResponseEntity<ApiError> handleUpstreamFailure(RuntimeException ex) {
        ApiError apiError = new ApiError(HttpStatus.SERVICE_UNAVAILABLE, "This is temporarily unavailable. Please try again.");
        log.error(apiError.toString(), ex);
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        ApiError apiError = new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
        log.error(apiError.toString(), ex);
        return ResponseEntity.status(apiError.status()).body(apiError);
    }
}
