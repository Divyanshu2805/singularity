package com.singularity.common.security;

import com.singularity.common.error.ForbiddenException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pins how the shared demo account is recognised - by its Firebase uid and nothing else - and that a refusal stops
 * only that account, and never a machine caller or a request that is not signed in.
 */
class DemoAccountTest {

    private final DemoAccount demoAccount = new DemoAccount("singularity-demo");

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static void signIn(Object principal) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
    }

    @Test
    @DisplayName("the demo account is refused, with a message that says why")
    void refusesTheDemoAccount() {
        signIn(new UserPrincipal(7L, "demo@divyanshuagrahari.dev", "singularity-demo", List.of()));

        assertThat(demoAccount.isCurrent()).isTrue();
        assertThatThrownBy(demoAccount::refuseCurrent)
                .isInstanceOf(ForbiddenException.class)
                .hasMessageContaining("shared demo account");
    }

    @Test
    @DisplayName("anyone else is let through, even with the demo account's address")
    void letsEveryoneElseThrough() {
        signIn(new UserPrincipal(8L, "demo@divyanshuagrahari.dev", "someone-else", List.of()));

        assertThat(demoAccount.isCurrent()).isFalse();
        assertThatCode(demoAccount::refuseCurrent).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("a machine caller and a request with no sign-in are never the demo account")
    void machineCallersAndAnonymousRequestsAreNotTheDemo() {
        assertThat(demoAccount.isCurrent()).isFalse();
        signIn("internal-service");
        assertThat(demoAccount.isCurrent()).isFalse();
        assertThat(demoAccount.is(null)).isFalse();
    }
}
