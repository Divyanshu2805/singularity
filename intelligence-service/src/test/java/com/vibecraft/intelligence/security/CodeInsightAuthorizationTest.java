package com.vibecraft.intelligence.security;

import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectRole;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.UserPrincipal;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.service.impl.CodeInsightServiceImpl;
import feign.FeignException;
import feign.Request;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
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
 * QA-02's role-matrix extension to {@link CodeInsightServiceImpl}, the service backing
 * {@code CodeInsightController} - the one {@code CLAUDE.md}'s Security &amp; Guardrails section calls out by name
 * as needing to stay structurally read-only. That guarantee (a read-only tool, prompts that never mention a write
 * protocol, a type-narrowed {@code ProjectFileReader}) is enforced elsewhere and at compile time; what had no
 * coverage until now is the ordinary authorization question every other guarded endpoint already answers: can a
 * signed-in stranger read or write another project's code notes and explanations at all. Every method here needs
 * only VIEW, so every role - viewer included - can use it once they are a member; a nonmember cannot.
 */
class CodeInsightAuthorizationTest {

    private static final long PROJECT_ID = 42L;
    private static final long OTHER_PROJECT_ID = 43L;
    private static final long USER_ID = 7L;

    private static final CodeInsightServiceImpl SERVICE =
            new CodeInsightServiceImpl(null, null, null, null, null, null, null, null);

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

    static Stream<Arguments> guardedMethods() {
        return Stream.of(
                arguments("explain"), arguments("ask"), arguments("streamExplain"), arguments("streamAsk"),
                arguments("getNotes"), arguments("saveNote"), arguments("deleteNote"), arguments("clearNotes"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("guardedMethods")
    @DisplayName("a signed-in user with no membership row is denied")
    void aNonMemberIsDenied(String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID)).thenThrow(notFound());

        assertThat(allowed(method, PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("guardedMethods")
    @DisplayName("membership of one project grants nothing on another")
    void membershipDoesNotCrossProjects(String method) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.OWNER));
        when(workspaceServiceClient.getMembership(OTHER_PROJECT_ID, USER_ID)).thenThrow(notFound());

        assertThat(allowed(method, OTHER_PROJECT_ID)).isFalse();
    }

    @ParameterizedTest(name = "{0} as {1}")
    @MethodSource("everyRoleTimesEveryMethod")
    @DisplayName("any role at all - viewer, editor, or owner - can use the code lens once they're a member")
    void anyRoleCanUse(String method, ProjectRole role) {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, role));

        assertThat(allowed(method, PROJECT_ID)).isTrue();
    }

    static Stream<Arguments> everyRoleTimesEveryMethod() {
        return guardedMethods().flatMap(m -> Stream.of(ProjectRole.values())
                .map(role -> arguments(m.get()[0], role)));
    }

    private boolean allowed(String method, long projectId) {
        Method endpoint = methodNamed(method);
        Object[] args = Arrays.copyOf(new Object[]{projectId}, endpoint.getParameterCount());

        AuthorizationResult decision = guard.authorize(() -> caller, new SimpleMethodInvocation(SERVICE, endpoint, args));

        assertThat(decision)
                .as("CodeInsightServiceImpl.%s must carry a @PreAuthorize, or every signed-in user can call it", method)
                .isNotNull();
        return decision.isGranted();
    }

    private static Method methodNamed(String name) {
        return Arrays.stream(SERVICE.getClass().getDeclaredMethods())
                .filter(m -> m.getName().equals(name))
                .findFirst()
                .orElseThrow(() -> new AssertionError("CodeInsightServiceImpl has no method " + name));
    }

    private static FeignException.NotFound notFound() {
        Request request = Request.create(Request.HttpMethod.GET, "/internal/v1/projects/1/members/1",
                Map.of(), (byte[]) null, StandardCharsets.UTF_8);
        return new FeignException.NotFound("not found", request, null, Map.of());
    }
}
