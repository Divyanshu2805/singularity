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

    /**
     * Two different failures share the 503, and the preview panel used to call both "every runner is busy" because
     * that was all it could see. The {@code code} is what tells them apart, so it must be there and it must differ.
     */
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
    @DisplayName("an error with no code serializes exactly as before - the field is omitted, not null")
    void codeIsOmittedWhenAbsent() throws Exception {
        // A bare mapper: the java.time module isn't on this module's test classpath, and `timestamp` isn't what's under
        // test, so let it fall back to bean serialization rather than pulling a dependency in for it.
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper()
                .disable(com.fasterxml.jackson.databind.MapperFeature.REQUIRE_HANDLERS_FOR_JAVA8_TIMES);

        String plain = mapper.writeValueAsString(new ApiError(HttpStatus.NOT_FOUND, "Not found"));
        String coded = mapper.writeValueAsString(ApiError.withCode(HttpStatus.SERVICE_UNAVAILABLE, "busy", ApiError.CAPACITY_UNAVAILABLE));

        assertThat(plain).doesNotContain("\"code\"");
        assertThat(coded).contains("\"code\":\"CAPACITY_UNAVAILABLE\"");
    }
}
