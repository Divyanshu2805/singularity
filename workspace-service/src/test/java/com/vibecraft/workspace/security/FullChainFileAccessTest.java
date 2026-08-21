package com.vibecraft.workspace.security;

import com.vibecraft.common.error.GlobalExceptionHandler;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.InternalServiceAuthFilter;
import com.vibecraft.common.security.ServiceSecurityConfig;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCookies;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.controller.FileController;
import com.vibecraft.workspace.dto.project.FileContentResponse;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.service.ProjectFileService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * CODE_REVIEW.md QA-02's "full-chain" half: unlike {@link FileReadAuthorizationTest} (which evaluates the
 * {@code @PreAuthorize} expression directly against a hand-built {@code ApplicationContext}), this drives a real
 * HTTP request through the actual {@code SecurityFilterChain} workspace-service boots in production -
 * {@code ServiceSecurityConfig.build}, the exact production method, called here with the same real
 * {@code SessionAuthFilter}/CSRF/{@code InternalServiceAuthFilter} wiring it always gets, only the
 * {@code SessionAuthenticator} implementation swapped for an in-memory stub instead of the real
 * {@code RemoteSessionAuthenticator} (which talks to account-service over Feign - no reason to stand up a live
 * Feign context for this slice). This covers session-cookie authentication, CSRF and {@code /internal/**}'s
 * authority requirement together, the way a browser request actually experiences them.
 *
 * <p>This is the first {@code @SpringBootTest}-family test in this codebase's backend, deliberately narrow
 * ({@code @WebMvcTest(FileController.class)}) to avoid the Windows-timezone-vs-Postgres problem every other backend
 * test here avoids a full context for (CLAUDE.md): a web slice never touches {@code DataSourceAutoConfiguration} at
 * all, so there is no JDBC connection for the timezone mismatch to break. This test deliberately does
 * <b>not</b> {@code @Import} {@code common-lib}'s {@code CommonLibAutoConfiguration} - {@code @WebMvcTest} does not
 * apply Boot's deferred auto-configuration ordering to a plain {@code @Import}, so
 * {@code @ConditionalOnMissingBean(SessionAuthenticator.class)} does not see a test-registered override in time,
 * and {@code CommonLibAutoConfiguration} still tries to build the real {@code RemoteSessionAuthenticator} (which
 * needs a live Feign context to account-service) and {@code FirebaseConfig}'s eager {@code FirebaseApp} bean (which
 * needs real-looking credentials). Calling {@code ServiceSecurityConfig.build(...)} directly with test doubles for
 * its five parameters is both simpler and exercises the identical production code path without either dependency.
 * {@code SecurityExpressions} (bean name {@code "security"}, the {@code @PreAuthorize} expression target) is
 * registered the same way {@link FileReadAuthorizationTest} already does manually.
 *
 * <p>Deliberately not attempted here: the full QA-02 role matrix across every controller. This covers one
 * representative guarded endpoint ({@code GET .../files/content}) end to end, plus the two chain-level guarantees
 * that apply everywhere regardless of controller (CSRF on a mutating request, {@code /internal/**}'s authority
 * requirement) - proving the pattern works, not exhaustively re-testing every endpoint through it. "Deleted
 * project" and "removed member" are not separately tested:
 * {@code ProjectMemberRepository.findRoleByProjectIdAndUserId} (SEC-03) already excludes both at the query level,
 * so a mocked repository cannot distinguish either from a plain nonmember - the query itself is JPQL, not
 * exercised by a mocked-repository test either way, consistent with this repo's existing testing conventions for
 * anything ultimately backed by a live database. "Pending invite" is likewise not distinguishable here: the query
 * has no {@code acceptedAt} filter at all (SEC-07, still open, decision needed), so a pending and an accepted
 * member are identical at this layer by construction, not by an oversight in this test.
 */
@WebMvcTest(FileController.class)
@Import({FullChainFileAccessTest.TestSecurityBeans.class, GlobalExceptionHandler.class})
class FullChainFileAccessTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;
    private static final String VALID_COOKIE = "valid-for-user-7";
    private static final String SESSION_COOKIE_NAME = "vc_session";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ProjectMemberRepository projectMemberRepository;

    @MockitoBean
    private ProjectFileService projectFileService;

    @Test
    @DisplayName("a viewer can read a project's file content")
    void aViewerCanRead() throws Exception {
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID))
                .thenReturn(Optional.of(ProjectRole.VIEWER));
        when(projectFileService.getFileContent(anyLong(), anyString()))
                .thenReturn(new FileContentResponse("src/App.tsx", "content"));

        mockMvc.perform(get("/api/projects/{projectId}/files/content", PROJECT_ID)
                        .param("path", "src/App.tsx")
                        .cookie(sessionCookie()))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a signed-in user who is not a member (or whose project is deleted, or who was removed) is denied")
    void aNonMemberIsDenied() throws Exception {
        when(projectMemberRepository.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/projects/{projectId}/files/content", PROJECT_ID)
                        .param("path", "src/App.tsx")
                        .cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("no session cookie at all is unauthenticated")
    void noCookieIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/projects/{projectId}/files/content", PROJECT_ID)
                        .param("path", "src/App.tsx"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a cookie the authenticator does not recognize is unauthenticated, not denied")
    void unrecognizedCookieIsUnauthenticated() throws Exception {
        mockMvc.perform(get("/api/projects/{projectId}/files/content", PROJECT_ID)
                        .param("path", "src/App.tsx")
                        .cookie(new Cookie(SESSION_COOKIE_NAME, "not-a-real-session")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("an ordinary session cookie does not satisfy /internal/** - SEC-01, at the full chain rather than the isolated filter")
    void sessionCookieDoesNotReachInternalEndpoints() throws Exception {
        mockMvc.perform(get("/internal/v1/projects/{projectId}/members/{userId}", PROJECT_ID, USER_ID)
                        .cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("no credentials at all cannot reach /internal/** either")
    void noCredentialsCannotReachInternalEndpoints() throws Exception {
        mockMvc.perform(get("/internal/v1/projects/{projectId}/members/{userId}", PROJECT_ID, USER_ID))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a mutating request with no CSRF token is rejected before it ever reaches a handler")
    void mutatingRequestWithNoCsrfTokenIsRejected() throws Exception {
        mockMvc.perform(post("/api/projects/{projectId}/files", PROJECT_ID)
                        .cookie(sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a mutating request carrying a genuine primed CSRF token passes the CSRF check")
    void mutatingRequestWithAPrimedCsrfTokenPassesCsrf() throws Exception {
        MvcResult priming = mockMvc.perform(get("/api/projects/{projectId}/files/content", PROJECT_ID)
                        .param("path", "src/App.tsx")
                        .cookie(sessionCookie()))
                .andReturn();
        Cookie xsrfCookie = priming.getResponse().getCookie("XSRF-TOKEN");
        assertThat(xsrfCookie).as("ServiceSecurityConfig's csrf().spa() must issue an XSRF-TOKEN cookie").isNotNull();

        // Not 403: the CSRF filter let this through. That path only has a @GetMapping (getFileTree), so POST
        // still ends up a 405 from the DispatcherServlet - the point here is which filter answered, not the
        // handler outcome.
        mockMvc.perform(post("/api/projects/{projectId}/files", PROJECT_ID)
                        .cookie(sessionCookie(), xsrfCookie)
                        .header("X-XSRF-TOKEN", xsrfCookie.getValue())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isMethodNotAllowed());
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

        @Bean
        ProjectMemberRepository projectMemberRepository() {
            return mock(ProjectMemberRepository.class);
        }

        @Bean("security")
        SecurityExpressions securityExpressions(ProjectMemberRepository projectMemberRepository, AuthUtil authUtil) {
            return new SecurityExpressions(projectMemberRepository, authUtil);
        }
    }
}
