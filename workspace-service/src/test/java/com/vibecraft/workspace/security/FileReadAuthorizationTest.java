package com.vibecraft.workspace.security;

import com.vibecraft.workspace.controller.FileController;
import com.vibecraft.workspace.enums.ProjectRole;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.workspace.repository.ProjectMemberRepository;
import com.vibecraft.workspace.service.impl.ProjectFileServiceImpl;
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
 * Covers that every browser-facing file endpoint is guarded, and that the service methods the internal API also calls
 * are deliberately not.
 *
 * <p>It evaluates the real annotations through Spring Security's own authorization manager against the real
 * permission bean, so it fails both on a missing guard and on an argument name that does not match the method's
 * parameter - which Spring evaluates to null and silently denies everyone.
 *
 * <p>This exists because the gap was found live: the file tree and file content endpoints carried no guard at all, so
 * any signed-in user could read any project's files, while the endpoints that were guarded correctly refused.
 */
class FileReadAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final FileController CONTROLLER = new FileController(null);
    private static final ProjectFileServiceImpl SERVICE = new ProjectFileServiceImpl(null, null, null, null);

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

    static Stream<Arguments> fileReads() {
        return Stream.of(
                arguments(CONTROLLER, "getFileTree"),
                arguments(CONTROLLER, "getFile"),
                arguments(SERVICE, "searchFiles"),
                arguments(SERVICE, "buildProjectZip"));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("fileReads")
    @DisplayName("a member with VIEW can read")
    void aMemberCanRead(Object target, String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.VIEWER));

        assertThat(allowed(target, method, PROJECT_ID)).isTrue();
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("fileReads")
    @DisplayName("a signed-in user who is not a member is denied")
    void aNonMemberIsDenied(Object target, String method) {

        assertThat(allowed(target, method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("fileReads")
    @DisplayName("membership of one project grants nothing on another")
    void membershipDoesNotCrossProjects(Object target, String method) {
        when(members.findRoleByProjectIdAndUserId(PROJECT_ID, USER_ID)).thenReturn(Optional.of(ProjectRole.OWNER));

        assertThat(allowed(target, method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"getFileContent", "saveFile", "deleteFile"})
    @DisplayName("the service methods the internal API shares carry no user guard")
    void internalApiMethodsStayUnguardedAtTheService(String method) {
        assertThat(AnnotatedElementUtils.hasAnnotation(methodNamed(SERVICE, method), PreAuthorize.class))
                .as("ProjectFileServiceImpl.%s is called by InternalWorkspaceController, which has no user to check", method)
                .isFalse();
    }

    private boolean allowed(Object target, String method, long projectId) {
        Method endpoint = methodNamed(target, method);
        Object[] args = Arrays.copyOf(new Object[]{projectId, "src/App.tsx"}, endpoint.getParameterCount());

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
}
