package com.singularity.account.security;

import com.singularity.account.controller.AuthController;
import com.singularity.account.controller.InternalAccountController;
import com.singularity.account.repository.RevokedSessionRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.service.SessionService;
import com.singularity.account.service.SubscriptionService;
import com.singularity.account.service.UserService;
import com.singularity.common.error.GlobalExceptionHandler;
import com.singularity.common.security.AuthProperties;
import com.singularity.common.security.DemoAccount;
import com.singularity.common.security.InternalServiceAuthFilter;
import com.singularity.common.security.SessionAuthenticator;
import com.singularity.common.security.SessionCookies;
import com.singularity.common.security.UserPrincipal;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * QA-02's full-chain half, extended to account-service - the same technique {@code workspace-service}'s
 * {@code FullChainFileAccessTest} established, applied for the first time to {@link WebSecurityConfig} itself
 * rather than to {@code ServiceSecurityConfig.build(...)}: account-service is "the only service with public
 * routes" (its own class javadoc), so it defines its own chain instead of using common-lib's shared one, and that
 * chain had no test at any level before now.
 *
 * <p>Deliberately does not load {@link com.singularity.account.controller.BillingController} - its
 * {@code @Value("${stripe.webhook.secret}")} field needs a real property to even construct the bean, which is
 * unrelated to what this test proves. {@code GET /api/plans} and {@code POST /webhooks/payment} are both routed
 * only there, so this test proves their chain-level rule (public, and for the webhook, CSRF-exempt too) by hitting
 * those paths anyway and expecting a plain 404 from the {@code DispatcherServlet} finding no handler - not the
 * {@code 401}/{@code 403} it would return if authentication or CSRF actually blocked the request. That the chain
 * lets a request reach "no handler found" instead of stopping it at the filter level is exactly the fact worth
 * proving here.
 *
 * <p>Also proves a rule easy to get backwards: {@code POST /api/auth/session}'s {@code permitAll()} exempts it from
 * needing to be signed in, not from CSRF - {@code csrf().spa()}'s exemptions are only {@code /webhooks/**} and
 * {@code /internal/**}, so an unauthenticated write to a nominally "public" route still needs a primed token.
 */
@WebMvcTest({AuthController.class, InternalAccountController.class})
@Import({FullChainAccountAccessTest.TestSecurityBeans.class, WebSecurityConfig.class, GlobalExceptionHandler.class})
class FullChainAccountAccessTest {

    private static final long USER_ID = 7L;
    private static final String DEMO_COOKIE = "valid-for-the-demo";
    private static final long DEMO_USER_ID = 99L;
    private static final String VALID_COOKIE = "valid-for-user-7";
    private static final String SESSION_COOKIE_NAME = "__Host-vc_session";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private java.util.List<org.springframework.security.web.SecurityFilterChain> securityChains;

    @Test
    @DisplayName("security headers are written before the handler runs, so a streamed response's own thread never shares them")
    void securityHeadersAreWrittenBeforeTheHandlerRuns() {
        java.util.List<org.springframework.security.web.header.HeaderWriterFilter> headerFilters = securityChains.stream()
                .flatMap(chain -> chain.getFilters().stream())
                .filter(org.springframework.security.web.header.HeaderWriterFilter.class::isInstance)
                .map(org.springframework.security.web.header.HeaderWriterFilter.class::cast)
                .toList();

        assertThat(headerFilters).isNotEmpty();
        assertThat(headerFilters).allSatisfy(filter -> assertThat(
                org.springframework.test.util.ReflectionTestUtils.getField(filter, "shouldWriteHeadersEagerly"))
                .isEqualTo(true));
    }

    @MockitoBean
    private SessionService sessionService;

    @MockitoBean
    private UserService userService;

    @MockitoBean
    private com.singularity.account.service.AccountDeletionService accountDeletionService;

    @MockitoBean
    private UserRepository userRepository;

    @MockitoBean
    private RevokedSessionRepository revokedSessionRepository;

    @MockitoBean
    private SubscriptionService subscriptionService;

    @Test
    @DisplayName("the CSRF-priming endpoint is public")
    void csrfEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/api/auth/csrf"))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("GET /api/plans is public - proven by reaching \"no handler\", not being stopped at the filter")
    void plansRouteIsPublic() throws Exception {
        mockMvc.perform(get("/api/plans"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the Stripe webhook route is public and CSRF-exempt")
    void webhookRouteIsPublicAndCsrfExempt() throws Exception {
        mockMvc.perform(post("/webhooks/payment"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("session creation is permitAll for authentication, but still needs a primed CSRF token")
    void sessionCreationIsPublicButStillNeedsCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/session"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a mutating request carrying a genuine primed CSRF token passes the CSRF check")
    void logoutWithPrimedCsrfTokenPassesCsrf() throws Exception {
        MvcResult priming = mockMvc.perform(get("/api/auth/csrf")).andReturn();
        Cookie xsrfCookie = priming.getResponse().getCookie("__Host-XSRF-TOKEN");
        assertThat(xsrfCookie).as("WebSecurityConfig's csrf().spa() must issue a __Host-XSRF-TOKEN cookie").isNotNull();

        mockMvc.perform(post("/api/auth/logout")
                        .cookie(xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue()))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("deleting an account needs a session, not only a CSRF token")
    void deletingAnAccountNeedsASession() throws Exception {
        Cookie xsrfCookie = mockMvc.perform(get("/api/auth/csrf")).andReturn().getResponse().getCookie("__Host-XSRF-TOKEN");

        mockMvc.perform(post("/api/auth/account/delete")
                        .cookie(xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue())
                        .contentType("application/json")
                        .content("{\"idToken\":\"token\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("deleting an account needs a CSRF token, not only a session")
    void deletingAnAccountNeedsCsrf() throws Exception {
        mockMvc.perform(post("/api/auth/account/delete")
                        .cookie(sessionCookie())
                        .contentType("application/json")
                        .content("{\"idToken\":\"token\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a signed-in caller with a CSRF token reaches the (mocked) deletion")
    void deletingAnAccountWithSessionAndCsrfReachesHandler() throws Exception {
        Cookie xsrfCookie = mockMvc.perform(get("/api/auth/csrf")).andReturn().getResponse().getCookie("__Host-XSRF-TOKEN");

        mockMvc.perform(post("/api/auth/account/delete")
                        .cookie(sessionCookie(), xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue())
                        .contentType("application/json")
                        .content("{\"idToken\":\"token\"}"))
                .andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("no session cookie at all is unauthenticated on a route that isn't public")
    void meRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a signed-in caller reaches the (mocked) handler")
    void meWithValidCookieReachesHandler() throws Exception {
        mockMvc.perform(get("/api/auth/me").cookie(sessionCookie()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("an ordinary session cookie does not satisfy /internal/** - SEC-01, for account-service's own chain")
    void sessionCookieDoesNotReachInternalEndpoints() throws Exception {
        mockMvc.perform(get("/internal/v1/users/{userId}", USER_ID).cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("no credentials at all cannot reach /internal/** either")
    void noCredentialsCannotReachInternalEndpoints() throws Exception {
        mockMvc.perform(get("/internal/v1/users/{userId}", USER_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("the shared demo account cannot delete itself or sign every device out")
    void theDemoAccountCannotDeleteItselfOrSignEveryoneOut() throws Exception {
        Cookie xsrf = mockMvc.perform(get("/api/auth/csrf")).andReturn().getResponse().getCookie("__Host-XSRF-TOKEN");
        Cookie demo = new Cookie(SESSION_COOKIE_NAME, DEMO_COOKIE);

        mockMvc.perform(post("/api/auth/account/delete").cookie(demo, xsrf).header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType("application/json").content("{\"idToken\":\"token\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/auth/logout-all").cookie(demo, xsrf).header("X-XSRF-TOKEN", xsrf.getValue()))
                .andExpect(status().isForbidden());

        verify(accountDeletionService, never()).deleteAccount(any(), any());
        verify(sessionService, never()).signOutEverywhere(any(), any());
    }

    private static Cookie sessionCookie() {
        return new Cookie(SESSION_COOKIE_NAME, VALID_COOKIE);
    }

    @TestConfiguration
    @EnableWebSecurity
    static class TestSecurityBeans {

        @Bean
        SessionAuthenticator sessionAuthenticator() {
            return cookie -> {
                if (DEMO_COOKIE.equals(cookie)) {
                    return Optional.of(new UserPrincipal(DEMO_USER_ID, "demo@singularity.dev", "singularity-demo", List.of()));
                }
                if (!VALID_COOKIE.equals(cookie)) return Optional.empty();
                return Optional.of(new UserPrincipal(USER_ID, "caller@example.com", "firebase-uid-7", List.of()));
            };
        }

        @Bean
        SessionCookies sessionCookies() {
            return new SessionCookies(new AuthProperties(
                    new AuthProperties.SessionCookie(SESSION_COOKIE_NAME, Duration.ofDays(5), true),
                    Duration.ofSeconds(60)));
        }

        @Bean
        InternalServiceAuthFilter internalServiceAuthFilter() {
            return new InternalServiceAuthFilter("test-shared-secret");
        }

        @Bean
        DemoAccount demoAccount() {
            return new DemoAccount("singularity-demo");
        }
    }
}
