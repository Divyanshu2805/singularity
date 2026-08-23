package com.vibecraft.intelligence.security;

import com.vibecraft.common.error.GlobalExceptionHandler;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.InternalServiceAuthFilter;
import com.vibecraft.common.security.ServiceSecurityConfig;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCookies;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.intelligence.controller.ChatController;
import com.vibecraft.intelligence.controller.InternalIntelligenceController;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.service.AiGenerationService;
import com.vibecraft.intelligence.service.ChatService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.servlet.HandlerExceptionResolver;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * QA-02's full-chain half, extended to intelligence-service - the same technique
 * {@code workspace-service}'s {@code FullChainFileAccessTest} established, proving that <b>this</b> service's own
 * {@code SecurityFilterChain} bean (built by the identical {@code ServiceSecurityConfig.build(...)} call, but a
 * separate bean instance per service since each one wires its own {@code SessionAuthenticator}/
 * {@code InternalServiceAuthFilter}) enforces session-cookie authentication, CSRF, and {@code /internal/**}'s
 * authority requirement the same way, rather than assuming workspace-service's proof carries over by construction.
 *
 * <p>This intentionally does not attempt to prove per-endpoint {@code @PreAuthorize} outcomes here - every guard in
 * this service lives on {@link com.vibecraft.intelligence.service.impl.ChatServiceImpl}/
 * {@link com.vibecraft.intelligence.service.impl.AiGenerationServiceImpl}, both mocked away by
 * {@code @WebMvcTest}, so no AOP interceptor is present to exercise - {@link ChatAuthorizationTest} already covers
 * that at the expression level, the same split {@code FileReadAuthorizationTest} vs. {@code FullChainFileAccessTest}
 * draws in workspace-service. What this proves is everything that happens before a request ever reaches the
 * (mocked) service: whether the caller is authenticated at all, and whether a mutating request without a valid CSRF
 * token gets through.
 */
@WebMvcTest({ChatController.class, InternalIntelligenceController.class})
@Import({FullChainChatAccessTest.TestSecurityBeans.class, GlobalExceptionHandler.class})
class FullChainChatAccessTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;
    private static final String VALID_COOKIE = "valid-for-user-7";
    private static final String SESSION_COOKIE_NAME = "vc_session";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ChatService chatService;

    @MockitoBean
    private AiGenerationService aiGenerationService;

    @Test
    @DisplayName("no session cookie at all is unauthenticated")
    void noCookieIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/chat/projects/{projectId}", PROJECT_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a cookie the authenticator does not recognize is unauthenticated, not denied")
    void unrecognizedCookieIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/chat/projects/{projectId}", PROJECT_ID)
                        .cookie(new Cookie(SESSION_COOKIE_NAME, "not-a-real-session")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a signed-in caller reaches the (mocked) handler")
    void signedInCallerReachesHandler() throws Exception {
        mockMvc.perform(get("/api/chat/projects/{projectId}", PROJECT_ID)
                        .cookie(sessionCookie()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an ordinary session cookie does not satisfy /internal/** - SEC-01, for this service's own chain")
    void sessionCookieDoesNotReachInternalEndpoints() throws Exception {
        mockMvc.perform(post("/internal/v1/projects/{projectId}/generation/stop", PROJECT_ID)
                        .cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("no credentials at all cannot reach /internal/** either")
    void noCredentialsCannotReachInternalEndpoints() throws Exception {
        mockMvc.perform(post("/internal/v1/projects/{projectId}/generation/stop", PROJECT_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a mutating request with no CSRF token is rejected before it ever reaches a handler")
    void mutatingRequestWithNoCsrfTokenIsRejected() throws Exception {
        mockMvc.perform(post("/api/chat/projects/{projectId}/active/stop", PROJECT_ID)
                        .cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a mutating request carrying a genuine primed CSRF token passes the CSRF check")
    void mutatingRequestWithAPrimedCsrfTokenPassesCsrf() throws Exception {
        MvcResult priming = mockMvc.perform(get("/api/chat/projects/{projectId}", PROJECT_ID)
                        .cookie(sessionCookie()))
                .andReturn();
        Cookie xsrfCookie = priming.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrfCookie).as("ServiceSecurityConfig's csrf().spa() must issue an XSRF-TOKEN cookie").isNotNull();

        mockMvc.perform(post("/api/chat/projects/{projectId}/active/stop", PROJECT_ID)
                        .cookie(sessionCookie(), xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue()))
                .andExpect(status().isNoContent());
    }

    private static Cookie sessionCookie() {
        return new Cookie(SESSION_COOKIE_NAME, VALID_COOKIE);
    }

    @TestConfiguration
    @EnableWebSecurity
    @EnableMethodSecurity
    static class TestSecurityBeans {

        @Bean
        SecurityFilterChain securityFilterChain(HttpSecurity httpSecurity, HandlerExceptionResolver handlerExceptionResolver) {
            SessionAuthenticator sessionAuthenticator = cookie -> {
                if (!VALID_COOKIE.equals(cookie)) return Optional.empty();
                return Optional.of(new UserPrincipal(USER_ID, "caller@example.com", "firebase-uid-7", List.of()));
            };
            SessionCookies sessionCookies = new SessionCookies(new AuthProperties(
                    new AuthProperties.SessionCookie(SESSION_COOKIE_NAME, Duration.ofDays(5), true),
                    Duration.ofSeconds(60)));
            InternalServiceAuthFilter internalServiceAuthFilter = new InternalServiceAuthFilter("test-shared-secret");
            return ServiceSecurityConfig.build(
                    httpSecurity, sessionAuthenticator, sessionCookies, handlerExceptionResolver, internalServiceAuthFilter);
        }

        @Bean
        AuthUtil authUtil() {
            return new AuthUtil();
        }

        // Not injected by type: intelligence-service's @EnableFeignClients registers its own
        // WorkspaceServiceClient proxy bean regardless of test slicing, and asking Spring to autowire this
        // mock by type forces it to resolve that candidate too - which fails, since the trimmed @WebMvcTest
        // context has no FeignClientFactory for it to build against. Capturing the mock directly sidesteps
        // the by-type lookup entirely.
        @Bean("security")
        SecurityExpressions securityExpressions(AuthUtil authUtil) {
            return new SecurityExpressions(mock(WorkspaceServiceClient.class), authUtil);
        }
    }
}
