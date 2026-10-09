package com.singularity.workspace.security;

import com.singularity.common.error.GlobalExceptionHandler;
import com.singularity.common.security.AuthProperties;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.InternalServiceAuthFilter;
import com.singularity.common.security.ServiceSecurityConfig;
import com.singularity.common.security.SessionAuthenticator;
import com.singularity.common.security.SessionCookies;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.controller.PublicAppController;
import com.singularity.workspace.controller.PublishController;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.publish.PublicAppResponse;
import com.singularity.workspace.dto.publish.PublishResponse;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.service.PublicAppService;
import com.singularity.workspace.service.PublishService;
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
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The publishing endpoints through the real filter chain - the one workspace-service boots, built by
 * {@code ServiceSecurityConfig.build} with the same public-path list its application.yaml sets - the way
 * {@link FullChainFileAccessTest} drives the files endpoints.
 *
 * <p>What this pins is what no per-method test can see. The public page of a shared app is the only anonymous surface
 * in the service, so it must be anonymous for a GET on exactly its prefix and for nothing else: a POST under the same
 * prefix (the fork) still needs a signed-in caller and a CSRF token, a look-alike path ({@code /api/publicity}) is not
 * caught by the pattern, and every {@code /api/projects/**} publish endpoint stays behind a session. The role matrix
 * on the service methods is {@link PublishAuthorizationTest}'s; here the services are mocked, so a request that gets
 * past the chain reaches the mock.
 */
@WebMvcTest({PublishController.class, PublicAppController.class})
@Import({FullChainPublishAccessTest.TestSecurityBeans.class, GlobalExceptionHandler.class})
class FullChainPublishAccessTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;
    private static final String VALID_COOKIE = "valid-for-user-7";
    private static final String SESSION_COOKIE_NAME = "__Host-vc_session";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PublishService publishService;

    @MockitoBean
    private PublicAppService publicAppService;

    @Test
    @DisplayName("anyone with the link can read a shared app, with no session at all")
    void aSharedAppIsReadableAnonymously() throws Exception {
        when(publicAppService.getApp("demo-ab12")).thenReturn(
                new PublicAppResponse("Demo", "demo-ab12", "http://demo-ab12.localhost:8090/", Instant.now(), 3));
        when(publicAppService.getFiles("demo-ab12")).thenReturn(List.of());

        mockMvc.perform(get("/api/public/apps/{slug}", "demo-ab12")).andExpect(status().isOk());
        mockMvc.perform(get("/api/public/apps/{slug}/files", "demo-ab12")).andExpect(status().isOk());
        mockMvc.perform(get("/api/public/apps/{slug}/files/content", "demo-ab12").param("path", "src/App.tsx"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("a POST on the public prefix - the fork - is refused without a session, and never reaches the service")
    void forkNeedsASession() throws Exception {
        mockMvc.perform(post("/api/public/apps/{slug}/fork", "demo-ab12")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().is4xxClientError());

        verify(publicAppService, never()).fork(anyString(), any());
    }

    @Test
    @DisplayName("a signed-in caller with the CSRF token can fork a shared app")
    void aSignedInCallerCanFork() throws Exception {
        when(publicAppService.fork(anyString(), any())).thenReturn(
                new ProjectResponse(9L, "Demo (fork)", ProjectRole.OWNER, Instant.now(), Instant.now(), null, 1L));
        Cookie xsrf = primeCsrf();

        mockMvc.perform(post("/api/public/apps/{slug}/fork", "demo-ab12")
                        .cookie(sessionCookie(), xsrf)
                        .header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a signed-in POST to fork with no CSRF token is rejected")
    void forkNeedsCsrf() throws Exception {
        mockMvc.perform(post("/api/public/apps/{slug}/fork", "demo-ab12")
                        .cookie(sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a path that only looks like the public prefix is not anonymous")
    void aLookAlikePathIsNotPublic() throws Exception {
        mockMvc.perform(get("/api/publicity/apps/demo")).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("a project's publish state is not readable without a session")
    void theStatusNeedsASession() throws Exception {
        mockMvc.perform(get("/api/projects/{projectId}/publish", PROJECT_ID)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/projects/{projectId}/publish/log", PROJECT_ID)).andExpect(status().isUnauthorized());

        verify(publishService, never()).getStatus(any());
    }

    @Test
    @DisplayName("publishing and unpublishing need a session and the CSRF token")
    void changingItNeedsASessionAndCsrf() throws Exception {
        mockMvc.perform(post("/api/projects/{projectId}/publish", PROJECT_ID)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(delete("/api/projects/{projectId}/publish", PROJECT_ID))
                .andExpect(status().is4xxClientError());
        mockMvc.perform(post("/api/projects/{projectId}/publish", PROJECT_ID)
                        .cookie(sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());

        verify(publishService, never()).publish(any(), any());
        verify(publishService, never()).unpublish(any());
    }

    @Test
    @DisplayName("a signed-in caller with the CSRF token reaches the publish endpoint")
    void aSignedInCallerReachesPublish() throws Exception {
        when(publishService.publish(any(), any())).thenReturn(
                new PublishResponse(false, null, "demo-ab12", null, null, false, false, null));
        Cookie xsrf = primeCsrf();

        mockMvc.perform(post("/api/projects/{projectId}/publish", PROJECT_ID)
                        .cookie(sessionCookie(), xsrf)
                        .header("X-XSRF-TOKEN", xsrf.getValue())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"slug\":\"demo-ab12\"}"))
                .andExpect(status().isAccepted());
        verify(publishService).publish(any(), any());
    }

    @Test
    @DisplayName("an ordinary session cookie does not reach /internal/**")
    void sessionCookieDoesNotReachInternalEndpoints() throws Exception {
        mockMvc.perform(get("/internal/v1/projects/{projectId}/publish", PROJECT_ID).cookie(sessionCookie()))
                .andExpect(status().isForbidden());
    }

    private Cookie primeCsrf() throws Exception {
        MvcResult priming = mockMvc.perform(get("/api/projects/{projectId}/publish", PROJECT_ID).cookie(sessionCookie()))
                .andReturn();
        Cookie xsrfCookie = priming.getResponse().getCookie("__Host-XSRF-TOKEN");
        assertThat(xsrfCookie).as("ServiceSecurityConfig's csrf().spa() must issue a __Host-XSRF-TOKEN cookie").isNotNull();
        return xsrfCookie;
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
            return ServiceSecurityConfig.build(httpSecurity, sessionAuthenticator, sessionCookies,
                    handlerExceptionResolver, internalServiceAuthFilter, List.of("/api/public/**"));
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
