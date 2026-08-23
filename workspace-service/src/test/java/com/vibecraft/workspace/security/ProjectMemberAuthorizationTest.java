package com.vibecraft.workspace.security;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.service.impl.ProjectMemberServiceImpl;
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
 * QA-02's role-matrix extension for {@link ProjectMemberServiceImpl}, the same expression-level technique
 * {@link FileReadAuthorizationTest} established. {@code getProjectMembers} needs only VIEW_MEMBERS (every
 * role has it - {@code ProjectRole.VIEWER} included); {@code inviteMember}/{@code updateMemberRole}/
 * {@code removeProjectMember} need MANAGE_MEMBERS, which only {@code OWNER} carries - so an editor, who can
 * edit and even delete the project itself, still cannot touch its membership.
 */
class ProjectMemberAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final ProjectMemberServiceImpl SERVICE =
            new ProjectMemberServiceImpl(null, null, null, null, null, null, null);

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

    static Stream<Arguments> manageGated() {
        return Stream.of(arguments("inviteMember"), arguments("updateMemberRole"), arguments("removeProjectMember"));
    }

    static Stream<Arguments> allGuarded() {
        return Stream.concat(Stream.of(arguments("getProjectMembers")), manageGated());
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
    @ValueSource(strings = {"VIEWER", "EDITOR", "OWNER"})
    @DisplayName("any role at all can list members - every role carries VIEW_MEMBERS")
    void anyRoleCanListMembers(String role) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.valueOf(role)));

        assertThat(allowed("getProjectMembers", PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("manageGated")
    @DisplayName("a viewer cannot manage membership")
    void viewerCannotManageMembers(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("manageGated")
    @DisplayName("an editor cannot manage membership either - EDITOR carries EDIT and DELETE, not MANAGE_MEMBERS")
    void editorCannotManageMembers(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("manageGated")
    @DisplayName("only the owner can manage membership")
    void ownerCanManageMembers(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("accepting an invite carries no guard - the invitee isn't a member yet, so there's nothing to check")
    void acceptInviteStaysUnguarded() {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed("acceptInvite"), PreAuthorize.class)).isFalse();
    }

    @Test
    @DisplayName("the internal accessible-project lookup carries no guard - only called from within already-guarded methods")
    void accessibleProjectLookupStaysUnguarded() {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed("getAccessibleProjectById"), PreAuthorize.class)).isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("ProjectMemberServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("ProjectMemberServiceImpl has no method " + name));
    }
}
