package com.vibecraft.common.error;

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
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

/**
 * Turns every exception any service throws into one ApiError shape.
 *
 * <p>Handles: the domain exceptions in this package (404, 403, 409, 400, 402 with quota numbers, 429 with a
 * Retry-After header, and the two 503s); Spring Security's authentication, authorization, CSRF and access-denied
 * failures; Spring MVC's own bad-request family (validation, type mismatch, missing parameter or header, unknown
 * path, wrong verb, unsupported media type, unreadable body); data-integrity violations; and a catch-all 500 whose
 * message says nothing specific while the stack trace goes to the log.
 *
 * <p>Several of these exist because their absence was a 500. An unknown URL, a Stripe webhook with no signature
 * header and any access-denied from the security chain all used to fall through to the catch-all. Registered
 * automatically by CommonLibAutoConfiguration, so no service imports it; every service sharing one handler is
 * deliberate, since a divergent error taxonomy between services is hard to notice from the browser. Full table:
 * docs/api/.
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

    @ExceptionHandler(CsrfException.class)
    public ResponseEntity<ApiError> handleCsrf(CsrfException ex) {
        ApiError apiError = new ApiError(HttpStatus.FORBIDDEN, "Your request couldn't be verified. Refresh the page and try again.");
        log.warn("{} (cause: {})", apiError, ex.getMessage());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

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

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiError> handleMissingHeader(MissingRequestHeaderException ex) {
        ApiError apiError = new ApiError(HttpStatus.BAD_REQUEST,
                "Missing required header '" + ex.getHeaderName() + "'");
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex) {
        ApiError apiError = new ApiError(HttpStatus.NOT_FOUND, "Not found");
        log.warn("{} ({} {})", apiError, ex.getHttpMethod(), ex.getResourcePath());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        ApiError apiError = new ApiError(HttpStatus.METHOD_NOT_ALLOWED, "This endpoint doesn't support " + ex.getMethod());
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).headers(ex.getHeaders()).body(apiError);
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiError> handleUnsupportedMediaType(HttpMediaTypeNotSupportedException ex) {
        ApiError apiError = new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Unsupported content type");
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
        ApiError apiError = ApiError.withCode(HttpStatus.SERVICE_UNAVAILABLE,
                "This is temporarily unavailable. Please try again.", ApiError.UPSTREAM_UNAVAILABLE);
        log.error(apiError.toString(), ex);
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(CapacityUnavailableException.class)
    public ResponseEntity<ApiError> handleCapacityUnavailable(CapacityUnavailableException ex) {
        ApiError apiError = ApiError.withCode(HttpStatus.SERVICE_UNAVAILABLE, ex.getMessage(), ApiError.CAPACITY_UNAVAILABLE);
        log.warn(apiError.toString());
        return ResponseEntity.status(apiError.status()).body(apiError);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        ApiError apiError = new ApiError(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred");
        log.error(apiError.toString(), ex);
        return ResponseEntity.status(apiError.status()).body(apiError);
    }
}
