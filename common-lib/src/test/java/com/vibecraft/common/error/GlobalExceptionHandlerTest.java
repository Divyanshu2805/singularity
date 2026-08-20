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
 * Covers that Spring MVC's own "the request was wrong" exceptions answer with the right 4xx rather than a 500.
 *
 * <p>Also covers that the two 503s stay distinguishable: an upstream failure is generic and tagged
 * UPSTREAM_UNAVAILABLE, while exhausted capacity keeps its own message and is tagged CAPACITY_UNAVAILABLE.
 *
 * <p>These exist because their absence was a 500: before the handlers, an unknown URL and a Stripe webhook without
 * its signature header both returned 500 with a stack trace in the log.
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

    @Test
    @DisplayName("a full pool is a 503 that keeps its own message and says CAPACITY_UNAVAILABLE")
    void fullPoolIsCodedAsCapacity() {
        ResponseEntity<ApiError> response = handler.handleCapacityUnavailable(
                new CapacityUnavailableException("Every preview runner is busy right now. Try again in a minute."));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody().message()).isEqualTo("Every preview runner is busy right now. Try again in a minute.");
        assertThat(response.getBody().code()).isEqualTo("CAPACITY_UNAVAILABLE");
    }

    @Test
    @DisplayName("a failed dependency is the same 503 but says UPSTREAM_UNAVAILABLE, and keeps its detail out of the body")
    void failedDependencyIsCodedAsUpstream() {
        var cluster = new ExternalServiceException("Kubernetes API at https://10.1.2.3:6443 refused the connection",
                new RuntimeException("connection refused"));
        var storage = new FileStorageException("bucket projects, key 7/src/App.tsx: timeout");

        for (RuntimeException failure : List.of(cluster, storage)) {
            ResponseEntity<ApiError> response = handler.handleUpstreamFailure(failure);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
            assertThat(response.getBody().code()).isEqualTo("UPSTREAM_UNAVAILABLE");
            assertThat(response.getBody().message()).isEqualTo("This is temporarily unavailable. Please try again.")
                    .doesNotContain("10.1.2.3").doesNotContain("bucket");
        }
    }

    @Test
    @DisplayName("the two 503s can be told apart by code alone")
    void theTwo503sDiffer() {
        String busy = handler.handleCapacityUnavailable(new CapacityUnavailableException("busy")).getBody().code();
        String failed = handler.handleUpstreamFailure(new ExternalServiceException("x", null)).getBody().code();

        assertThat(busy).isNotBlank();
        assertThat(failed).isNotBlank();
        assertThat(busy).isNotEqualTo(failed);
    }

    @Test
    @DisplayName("API-QA-14: every error carries its own requestId, and two errors never share one")
    void everyErrorCarriesItsOwnRequestId() {
        String first = new ApiError(HttpStatus.NOT_FOUND, "Not found").requestId();
        String second = new ApiError(HttpStatus.NOT_FOUND, "Not found").requestId();

        assertThat(first).isNotBlank();
        assertThat(second).isNotBlank();
        assertThat(first).isNotEqualTo(second);
    }

    @Test
    @DisplayName("an error with no code serializes exactly as before - the field is omitted, not null")
    void codeIsOmittedWhenAbsent() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper()
                .disable(com.fasterxml.jackson.databind.MapperFeature.REQUIRE_HANDLERS_FOR_JAVA8_TIMES);

        String plain = mapper.writeValueAsString(new ApiError(HttpStatus.NOT_FOUND, "Not found"));
        String coded = mapper.writeValueAsString(ApiError.withCode(HttpStatus.SERVICE_UNAVAILABLE, "busy", ApiError.CAPACITY_UNAVAILABLE));

        assertThat(plain).doesNotContain("\"code\"");
        assertThat(coded).contains("\"code\":\"CAPACITY_UNAVAILABLE\"");
    }
}
