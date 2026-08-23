package com.vibecraft.intelligence.security;

import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectRole;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.service.impl.AiGenerationServiceImpl;
import com.vibecraft.intelligence.service.impl.ChatServiceImpl;
import feign.FeignException;
import feign.Request;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.authorization.AuthorizationResult;
import org.springframework.security.authorization.method.PreAuthorizeAuthorizationManager;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.util.SimpleMethodInvocation;

import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * QA-02's role-matrix extension to intelligence-service: the same expression-level technique
 * {@code FileReadAuthorizationTest}/{@code ProjectAuthorizationTest} established in workspace-service, applied
 * here for the first time. Unlike workspace-service, membership is not a local repository lookup but a Feign call
 * to workspace-service's {@code /internal/v1/projects/{id}/members/{userId}} - a 404 there (no row at all, or the
 * project soft-deleted, per that endpoint's own contract) surfaces as {@link FeignException.NotFound} and
 * {@link SecurityExpressions#canViewProject}/{@code canEditProject} both treat it as "not a member", exactly like
 * a genuine non-member. {@code ChatController} and {@code AiGenerationService.streamResponse} carry no guard of
 * their own - every check here lives on {@link ChatServiceImpl}/{@link AiGenerationServiceImpl}, which is why this
 * had no coverage at any level before now: {@code CLAUDE.md} flags this service's read/write split as
 * security-sensitive, and none of it was previously proven to actually deny anyone.
 */
class ChatAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final ChatServiceImpl CHAT_SERVICE = new ChatServiceImpl(null, null, null, null, null);
    private static final AiGenerationServiceImpl GENERATION_SERVICE = new AiGenerationServiceImpl(
            null, null, null, null, null, null, null, null, null, null, null, null);

    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final GenericApplicationContext context = new GenericApplicationContext();
    private final Authentication caller = new UsernamePasswordAuthenticationToken(
            new UserPrincipal(USER_ID, "caller", "firebase-uid", List.of()), null, List.of());
    private PreAuthorizeAuthorizationManager guard;

    @BeforeEach
    void signIn() {
        context.registerBean("security", SecurityExpressions.class,
                () -> new SecurityExpressions(workspaceServiceClient, new AuthUtil()));
        context.refresh();
        DefaultMethodSecurityExpressionHandler handler = new DefaultMethodSecurityExpressionHandler();
        handler.setApplicationContext(context);
        guard = new PreAuthorizeAuthorizationManager();
        guard.setExpressionHandler(handler);
        SecurityContextHolder.getContext().setAuthentication(caller);
    }

    @AfterEach
    void clean() {
        SecurityContextHolder.clearContext();
        context.close();
    }

    static Stream<Arguments> viewGated() {
        return Stream.of(
                arguments(CHAT_SERVICE, "getProjectChatHistory"),
                arguments(CHAT_SERVICE, "getLastTurnChanges"),
                arguments(GENERATION_SERVICE, "findActiveGeneration"),
                arguments(GENERATION_SERVICE, "watchActiveGeneration"));
    }

    static Stream<Arguments> editGated() {
        return Stream.of(arguments(GENERATION_SERVICE, "stopActiveGeneration"));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource({"viewGated", "editGated"})
    @DisplayName("a member can call a guarded method")
    void aMemberCanCall(Object target, String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.EDITOR));

        assertThat(allowed(target, method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource({"viewGated", "editGated"})
    @DisplayName("a signed-in user with no membership row (nonmember, or the project is soft-deleted) is denied")
    void aNonMemberIsDenied(Object target, String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID)).thenThrow(notFound());

        assertThat(allowed(target, method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource({"viewGated", "editGated"})
    @DisplayName("membership of one project grants nothing on another")
    void membershipDoesNotCrossProjects(Object target, String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.OWNER));
        when(workspaceServiceClient.getMembership(OTHER_PROJECT_ID, USER_ID)).thenThrow(notFound());

        assertThat(allowed(target, method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("viewGated")
    @DisplayName("a viewer can call a VIEW-gated method")
    void viewerCanCallViewGated(Object target, String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.VIEWER));

        assertThat(allowed(target, method, PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("a viewer cannot start or stop a generation - streamResponse and stopActiveGeneration need EDIT")
    void viewerCannotEditGenerate() {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.VIEWER));

        assertThat(allowed(GENERATION_SERVICE, "stopActiveGeneration", PROJECT_ID)).isFalse();
        assertThat(allowedStreamResponse(ProjectRole.VIEWER, PROJECT_ID)).isFalse();
    }

    @Test
    @DisplayName("an editor can start a generation - streamResponse's #projectId is its second parameter, not its first")
    void editorCanStreamResponse() {
        assertThat(allowedStreamResponse(ProjectRole.EDITOR, PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("a nonmember cannot start a generation on another project via streamResponse")
    void nonMemberCannotStreamResponseOnOtherProject() {
        when(workspaceServiceClient.getMembership(OTHER_PROJECT_ID, USER_ID)).thenThrow(notFound());

        assertThat(allowedStreamResponse(null, OTHER_PROJECT_ID)).isFalse();
    }

    @Test
    @DisplayName("stopGenerationsForProject carries no guard - only InternalIntelligenceController calls it, "
            + "acting on workspace-service's own delete/remove, not a user request")
    void stopGenerationsForProjectStaysUnguarded() {
        assertThat(AnnotatedElementUtils.hasAnnotation(
                methodNamed(GENERATION_SERVICE, "stopGenerationsForProject"), PreAuthorize.class)).isFalse();
    }

    private boolean allowedStreamResponse(ProjectRole role, long projectId) {
        if (role != null) {
            when(workspaceServiceClient.getMembership(projectId, USER_ID))
                    .thenReturn(new ProjectMembershipDto(projectId, USER_ID, role));
        }
        Method endpoint = methodNamed(GENERATION_SERVICE, "streamResponse");
        Object[] args = new Object[]{"hello", projectId, false};

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(GENERATION_SERVICE, endpoint, args));
        assertThat(decision).isNotNull();
        return decision.isGranted();
    }

    private boolean allowed(Object target, String method, long projectId) {
        Method endpoint = methodNamed(target, method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(target, endpoint, args));

        assertThat(decision)
                .as("%s.%s must carry a @PreAuthorize, or every signed-in user can call it", target.getClass().getSimpleName(), method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(Object target, String name) {
        return Arrays.stream(target.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError(target.getClass().getSimpleName() + " has no method " + name));
    }

    private static FeignException.NotFound notFound() {
        Request request = Request.create(Request.HttpMethod.GET, "/internal/v1/projects/1/members/1",
                Map.of(), (byte[]) null, StandardCharsets.UTF_8);
        return new FeignException.NotFound("not found", request, null, Map.of());
    }
}
