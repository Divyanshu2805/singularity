package com.singularity.workspace.security;

import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.service.impl.ProjectThumbnailServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
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
 * The role matrix for {@link ProjectThumbnailServiceImpl}, in the same expression-level style as
 * {@link GitHubAuthorizationTest}: the real {@code @PreAuthorize} on each method is evaluated against a stubbed
 * membership, once for every kind of caller.
 *
 * <p>Seeing a project's picture needs only VIEW, as opening the project does. Sending one needs EDIT: the picture is
 * whatever the previewed page drew, so only someone who may change that page may replace it.
 */
class ThumbnailAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final ProjectThumbnailServiceImpl SERVICE = new ProjectThumbnailServiceImpl(null, null);

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
    @ValueSource(strings = {"save", "read"})
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(String method) {
        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"save", "read"})
    @DisplayName("being the owner of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ProjectRole.class)
    @DisplayName("every member - viewer, editor or owner - may see the picture")
    void anyMemberMaySeeThePicture(ProjectRole role) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(role));

        assertThat(allowed("read", PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = ProjectRole.class, names = {"OWNER", "EDITOR"})
    @DisplayName("the owner and an editor may send a new picture")
    void whoMayEditMaySendAPicture(ProjectRole role) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(role));

        assertThat(allowed("save", PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("a viewer may not send a picture")
    void aViewerMayNotSendAPicture() {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed("save", PROJECT_ID)).isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(method))
                .findFirst()
                .orElseThrow(() -> new AssertionError("ProjectThumbnailServiceImpl has no method " + method));
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("ProjectThumbnailServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }
}
