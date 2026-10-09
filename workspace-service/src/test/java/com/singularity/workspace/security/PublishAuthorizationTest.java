package com.singularity.workspace.security;

import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.UserPrincipal;
import com.singularity.workspace.enums.ProjectRole;
import com.singularity.workspace.repository.ProjectMemberRepository;
import com.singularity.workspace.service.impl.PublishServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
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
 * The role matrix for {@link PublishServiceImpl}, in the same expression-level style as
 * {@link PreviewAuthorizationTest}: the real {@code @PreAuthorize} on each method is evaluated against a stubbed
 * membership, once for every kind of caller.
 *
 * <p>Reading where a publish stands needs only VIEW - every member, a viewer included, may see that a project is
 * published and where. Everything that changes it - publishing, updating, unpublishing, sharing the code, reading a
 * failed build's output - needs PUBLISH, which only the owner holds; an editor, who may change the code, may not put
 * it on a public link. The two methods with no guard are the ones the service itself calls: taking an app down for a
 * deleted project (the owner was already authorised for the delete) and the project cards' lookup of live links
 * (already limited to projects the caller is in).
 */
class PublishAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final PublishServiceImpl SERVICE =
            new PublishServiceImpl(null, null, null, null, null, null, null, null, null);

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

    static Stream<Arguments> ownerOnly() {
        return Stream.of(arguments("publish"), arguments("unpublish"), arguments("setSharing"), arguments("getBuildLog"));
    }

    static Stream<Arguments> everyEndpoint() {
        return Stream.concat(ownerOnly(), Stream.of(arguments("getStatus")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("everyEndpoint")
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(String method) {
        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("everyEndpoint")
    @DisplayName("being the owner of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("ownerOnly")
    @DisplayName("the owner may publish, update, unpublish, share the code and read a failed build")
    void theOwnerMayChangeIt(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("ownerOnly")
    @DisplayName("an editor - who may change the code - may not put it on a public link")
    void anEditorMayNotChangeIt(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.EDITOR));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("ownerOnly")
    @DisplayName("a viewer may not change it either")
    void aViewerMayNotChangeIt(String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(ProjectRole.class)
    @DisplayName("every member - viewer, editor or owner - may see where the publish stands")
    void anyMemberMayReadTheState(ProjectRole role) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(role));

        assertThat(allowed("getStatus", PROJECT_ID)).isTrue();
    }

    @Test
    @DisplayName("only the owner role carries the PUBLISH permission")
    void onlyTheOwnerHoldsThePermission() {
        assertThat(ProjectRole.OWNER.getPermissions()).contains(com.singularity.workspace.enums.ProjectPermission.PUBLISH);
        assertThat(ProjectRole.EDITOR.getPermissions()).doesNotContain(com.singularity.workspace.enums.ProjectPermission.PUBLISH);
        assertThat(ProjectRole.VIEWER.getPermissions()).doesNotContain(com.singularity.workspace.enums.ProjectPermission.PUBLISH);
    }

    @Test
    @DisplayName("the wire copy of the roles in common-lib agrees: owner publishes, editor and viewer do not")
    void theWireCopyAgrees() {
        assertThat(com.singularity.common.dto.ProjectRole.OWNER.permissions())
                .contains(com.singularity.common.dto.ProjectPermission.PUBLISH);
        assertThat(com.singularity.common.dto.ProjectRole.EDITOR.permissions())
                .doesNotContain(com.singularity.common.dto.ProjectPermission.PUBLISH);
        assertThat(com.singularity.common.dto.ProjectRole.VIEWER.permissions())
                .doesNotContain(com.singularity.common.dto.ProjectPermission.PUBLISH);
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"takeDown", "liveUrls"})
    @DisplayName("the two methods the service calls itself carry no guard")
    void serviceCalledMethodsStayUnguarded(String method) {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed(method), PreAuthorize.class))
                .as("PublishServiceImpl.%s is called from service-layer code, not a user request", method)
                .isFalse();
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("PublishServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("PublishServiceImpl has no method " + name));
    }
}
