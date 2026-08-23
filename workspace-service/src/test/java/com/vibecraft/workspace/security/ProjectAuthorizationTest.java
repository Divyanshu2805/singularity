package com.vibecraft.workspace.security;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.service.impl.ProjectServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
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
 * QA-02's role-matrix extension for {@link ProjectServiceImpl} - the same expression-level technique
 * {@link FileReadAuthorizationTest} established, applied to the methods {@link com.vibecraft.workspace.controller.ProjectController}
 * delegates to (its own controller methods carry no {@code @PreAuthorize} themselves; every guard lives here).
 *
 * <p>Unlike file access, which only ever needs VIEW, this service has three distinct gates worth telling apart:
 * VIEW-gated methods any member can call, EDIT-gated methods that also admit an editor (whose permission set
 * includes DELETE, per {@link ProjectRole#EDITOR} - not a bug in this test, the role definition itself grants it),
 * and the one DELETE-gated method, {@code softDelete}, which a viewer alone cannot reach.
 */
class ProjectAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final ProjectServiceImpl SERVICE =
            new ProjectServiceImpl(null, null, null, null, null, null, null, null, null);

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
        return Stream.of(arguments("getUserProjectById"), arguments("setPinned"), arguments("setStarred"));
    }

    static Stream<Arguments> editGated() {
        return Stream.of(arguments("forkProject"), arguments("updateProject"), arguments("retryTemplateInitialization"));
    }

    static Stream<Arguments> allGuarded() {
        return Stream.concat(Stream.concat(viewGated(), editGated()), Stream.of(arguments("softDelete")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("allGuarded")
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(String method) {
        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("allGuarded")
    @DisplayName("membership of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("viewGated")
    @DisplayName("a viewer can call a VIEW-gated method")
    void viewerCanCallViewGated(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("editGated")
    @DisplayName("a viewer cannot call an EDIT-gated method")
    void viewerCannotCallEditGated(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("editGated")
    @DisplayName("an editor can call an EDIT-gated method")
    void editorCanCallEditGated(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("a viewer cannot soft-delete")
    void viewerCannotSoftDelete() {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed("softDelete", PROJECT_ID)).isFalse();
    }

    @Test
    @DisplayName("an editor can soft-delete - EDITOR's permission set includes DELETE")
    void editorCanSoftDelete() {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(allowed("softDelete", PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("an owner can soft-delete")
    void ownerCanSoftDelete() {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed("softDelete", PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"createProject", "createProjectFromPrompt", "getUserProjects", "getAccessibleProjectById"})
    @DisplayName("methods with nothing to check against an existing project's membership carry no guard")
    void unscopedMethodsStayUnguarded(String method) {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed(method), PreAuthorize.class))
                .as("ProjectServiceImpl.%s has no projectId to check membership against, or is only ever called "
                        + "from within an already-guarded method", method)
                .isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("ProjectServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("ProjectServiceImpl has no method " + name));
    }
}
