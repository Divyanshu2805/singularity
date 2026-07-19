package com.vibecraft.common.error;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Spring MVC's own "the request was wrong" exceptions must answer with the right 4xx. Before these handlers existed
 * they all fell into the generic handler and came out as a 500 with a stack trace in the log - found when an
 * unknown URL and a Stripe webhook without its signature header both returned 500 after the Phase 4 cutover.
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @SuppressWarnings("unused")
    private static void endpoint(String header) {
    }

    private static MethodParameter aStringParameter() throws NoSuchMethodException {
        return new MethodParameter(GlobalExceptionHandlerTest.class.getDeclaredMethod("endpoint", String.class), 0);
    }

    @Test
    @DisplayName("a missing required header is a 400 that names the header")
    void missingHeaderIs400() throws Exception {
        ResponseEntity<ApiError> response =
                handler.handleMissingHeader(new MissingRequestHeaderException("Stripe-Signature", aStringParameter()));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().message()).contains("Stripe-Signature");
    }

    @Test
    @DisplayName("a URL nothing serves is a 404, and doesn't echo the path back")
    void unknownUrlIs404() {
        ResponseEntity<ApiError> response =
                handler.handleNoResource(new NoResourceFoundException(HttpMethod.GET, "internal/v1/users", "No static resource internal/v1/users."));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody().message()).isEqualTo("Not found").doesNotContain("internal");
    }

    @Test
    @DisplayName("the wrong verb is a 405 with the Allow header the response must carry")
    void wrongVerbIs405() {
        ResponseEntity<ApiError> response =
                handler.handleMethodNotAllowed(new HttpRequestMethodNotSupportedException("GET", List.of("POST")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getHeaders().getFirst(HttpHeaders.ALLOW)).isEqualTo("POST");
    }

    @Test
    @DisplayName("an unreadable content type is a 415")
    void unsupportedContentTypeIs415() {
        ResponseEntity<ApiError> response = handler.handleUnsupportedMediaType(
                new HttpMediaTypeNotSupportedException(MediaType.TEXT_PLAIN, List.of(MediaType.APPLICATION_JSON)));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }
}
