package com.vibecraft.workspace.security;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.service.impl.PreviewDeploymentServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
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
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.params.provider.Arguments.arguments;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * QA-02's role-matrix extension for {@link PreviewDeploymentServiceImpl}, the same expression-level technique
 * {@link FileReadAuthorizationTest} established. Every browser-facing preview endpoint only needs VIEW - starting,
 * inspecting, restarting, stopping and reading logs are all available to any project member, not just an editor
 * or owner, mirroring {@link com.vibecraft.workspace.controller.PreviewController}'s own "any member can use the
 * preview" intent. The lifecycle/bookkeeping methods below carry no guard because they are never reached from a
 * user request: {@code getMyActivePreviews} lists the caller's own previews; the rest are called from other
 * service-layer code (soft-delete cascades, membership removal, runner-pool bookkeeping) with no per-request
 * {@code UserPrincipal} to check.
 */
class PreviewAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final PreviewDeploymentServiceImpl SERVICE =
            new PreviewDeploymentServiceImpl(null, null, null, null, null, null, null, null, null, null);

    private final ProjectMemberRepository members = mock(ProjectMemberRepository.class);
    private final GenericApplicationContext context = new GenericApplicationContext();
    private final Authentication caller = new UsernamePasswordAuthenticationToken(
            new UserPrincipal(USER_ID, "caller", "firebase-uid", List.of()), null, List.of());
    private PreAuthorizeAuthorizationManager guard;

    @BeforeEach
    void signIn() {
        context.registerBean("security", SecurityExpressions.class, () -> new SecurityExpressions(members, new AuthUtil()));
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
                arguments("startPreview"), arguments("getPreview"), arguments("restartPreview"),
                arguments("stopPreview"), arguments("getPreviewLogs"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("viewGated")
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(String method) {
        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("viewGated")
    @DisplayName("membership of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("viewGated")
    @DisplayName("any role - viewer, editor, or owner - can use the preview")
    void anyMemberCanUsePreview(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {
            "getMyActivePreviews", "countActivePreviews", "stopAllForProject",
            "endSessionForUser", "shutDownIfUnused", "lockFor", "republishRoute"})
    @DisplayName("lifecycle and bookkeeping methods with no per-request caller carry no guard")
    void internalLifecycleMethodsStayUnguarded(String method) {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed(method), PreAuthorize.class))
                .as("PreviewDeploymentServiceImpl.%s is called from service-layer code, not a user request", method)
                .isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("PreviewDeploymentServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("PreviewDeploymentServiceImpl has no method " + name));
    }
}
