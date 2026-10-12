package com.singularity.workspace.security;

import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.service.impl.GitHubServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The role matrix for {@link GitHubServiceImpl}, in the same expression-level style as
 * {@link PublishAuthorizationTest}: the real {@code @PreAuthorize} on each method is evaluated against a stubbed
 * membership, once for every kind of caller.
 *
 * <p>Seeing where a project stands with its repository needs only VIEW. Pushing it and forgetting the link need
 * PUBLISH, which only the owner holds: a push sends every file of the project to a place its other members do not
 * control, so an editor, who may change the code, may not send it there. The four methods about a person's own
 * connection carry no project guard, since they concern no project - each acts only on the row of whoever is signed
 * in.
 */
class GitHubAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    @SuppressWarnings("unchecked")
    private static final GitHubServiceImpl SERVICE = new GitHubServiceImpl(null, null, null, null, null,
            mock(ObjectProvider.class), mock(ObjectProvider.class), mock(ObjectProvider.class));

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

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"projectStatus", "push", "unlink"})
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(String method) {
        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"projectStatus", "push", "unlink"})
    @DisplayName("being the owner of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"push", "unlink"})
    @DisplayName("the owner may push the project and forget its repository")
    void theOwnerMayPush(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"push", "unlink"})
    @DisplayName("an editor - who may change the code - may not send it to GitHub")
    void anEditorMayNotPush(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"push", "unlink"})
    @DisplayName("a viewer may not either")
    void aViewerMayNotPush(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ProjectRole.class)
    @DisplayName("every member - viewer, editor or owner - may see where the project stands with its repository")
    void anyMemberMayReadTheStanding(ProjectRole role) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(role));

        assertThat(allowed("projectStatus", PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"status", "startConnect", "completeConnect", "disconnect"})
    @DisplayName("a person's own connection concerns no project, so it carries no project guard")
    void theConnectionMethodsCarryNoProjectGuard(String method) {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed(method), PreAuthorize.class))
                .as("GitHubServiceImpl.%s acts on the signed-in person's own row only", method)
                .isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("GitHubServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("GitHubServiceImpl has no method " + name));
    }
}
