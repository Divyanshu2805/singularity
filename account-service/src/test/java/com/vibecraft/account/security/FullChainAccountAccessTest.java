package com.vibecraft.account.security;

import com.vibecraft.account.controller.AuthController;
import com.vibecraft.account.controller.InternalAccountController;
import com.vibecraft.account.repository.RevokedSessionRepository;
import com.vibecraft.account.repository.UserRepository;
import com.vibecraft.account.service.SessionService;
import com.vibecraft.account.service.SubscriptionService;
import com.vibecraft.account.service.UserService;
import com.vibecraft.common.error.GlobalExceptionHandler;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.InternalServiceAuthFilter;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCookies;
import com.vibecraft.common.security.UserPrincipal;
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
 * <p>Deliberately does not load {@link com.vibecraft.account.controller.BillingController} - its
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
    private static final String VALID_COOKIE = "valid-for-user-7";
    private static final String SESSION_COOKIE_NAME = "vc_session";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private SessionService sessionService;

    @MockitoBean
    private UserService userService;

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
        Cookie xsrfCookie = priming.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrfCookie).as("WebSecurityConfig's csrf().spa() must issue an XSRF-TOKEN cookie").isNotNull();

        mockMvc.perform(post("/api/auth/logout")
                        .cookie(xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue()))
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

    private static Cookie sessionCookie() {
        return new Cookie(SESSION_COOKIE_NAME, VALID_COOKIE);
    }

    @TestConfiguration
    @EnableWebSecurity
    static class TestSecurityBeans {

        @Bean
        SessionAuthenticator sessionAuthenticator() {
            return cookie -> {
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
    }
}
