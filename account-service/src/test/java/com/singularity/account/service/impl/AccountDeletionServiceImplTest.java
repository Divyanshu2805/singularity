package com.singularity.account.service.impl;

import com.singularity.account.dto.auth.DeleteAccountRequest;
import com.singularity.account.entity.User;
import com.singularity.account.feign.IntelligenceServiceClient;
import com.singularity.account.feign.WorkspaceServiceClient;
import com.singularity.account.repository.AuthAuditEventRepository;
import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.security.SessionEvictionNotifier;
import com.singularity.account.service.PaymentProcessor;
import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.ForbiddenException;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.IdentityVerifier;
import com.singularity.common.security.SessionCache;
import com.singularity.common.security.SessionCookies;
import com.singularity.common.security.UserPrincipal;
import com.singularity.common.security.VerifiedIdentity;
import feign.FeignException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.mock.web.MockHttpServletResponse;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Deleting an account: only with a sign-in that is the caller's own and minutes old; the other services' data first,
 * then the subscription, then the Firebase user, then the row emptied and every session ended; and nothing at all
 * changed here when another service could not delete its part, so the person can try again.
 */
class AccountDeletionServiceImplTest {

    private static final Instant NOW = Instant.parse("2026-10-14T10:00:00Z");
    private static final long USER_ID = 7L;
    private static final String UID = "uid-7";

    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final IdentityVerifier identityVerifier = mock(IdentityVerifier.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final AuthAuditEventRepository auditEvents = mock(AuthAuditEventRepository.class);
    private final CheckoutIntentRepository checkoutIntents = mock(CheckoutIntentRepository.class);
    private final WorkspaceServiceClient workspace = mock(WorkspaceServiceClient.class);
    private final IntelligenceServiceClient intelligence = mock(IntelligenceServiceClient.class);
    private final PaymentProcessor paymentProcessor = mock(PaymentProcessor.class);
    private final SessionCache sessionCache = mock(SessionCache.class);
    private final SessionEvictionNotifier notifier = mock(SessionEvictionNotifier.class);
    private final SessionCookies sessionCookies = mock(SessionCookies.class);

    private final AccountDeletionServiceImpl service = new AccountDeletionServiceImpl(
            authUtil, identityVerifier, userRepository, auditEvents, checkoutIntents, workspace, intelligence,
            paymentProcessor, sessionCache, notifier, sessionCookies, Clock.fixed(NOW, ZoneOffset.UTC));

    private User user;

    @BeforeEach
    void signedIn() {
        user = User.builder().id(USER_ID).username("person@example.com").name("Person").firebaseUid(UID)
                .stripeCustomerId("cus_1").build();
        when(authUtil.getCurrentPrincipal()).thenReturn(new UserPrincipal(USER_ID, "person@example.com", UID, List.of()));
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(user));
    }

    private static VerifiedIdentity signIn(String uid, Instant authTime) {
        return new VerifiedIdentity(uid, "person@example.com", true, "Person", "password", false, authTime, NOW.plusSeconds(3600));
    }

    @Test
    void deletesEverywhereInOrderAndEmptiesTheRow() {
        when(identityVerifier.verifyIdToken("token")).thenReturn(signIn(UID, NOW.minusSeconds(30)));
        MockHttpServletResponse response = new MockHttpServletResponse();

        service.deleteAccount(new DeleteAccountRequest("token"), response);

        InOrder order = inOrder(workspace, intelligence, paymentProcessor, identityVerifier, userRepository, notifier, sessionCookies);
        order.verify(workspace).deleteUserData(USER_ID, new DeleteUserDataRequest("person@example.com"));
        order.verify(intelligence).deleteUserData(USER_ID);
        order.verify(paymentProcessor).cancelImmediately(USER_ID);
        order.verify(identityVerifier).deleteUser(UID);
        order.verify(userRepository).save(user);
        order.verify(notifier).evictUser(UID);
        order.verify(sessionCookies).clear(response);

        assertThat(user.getDeletedAt()).isEqualTo(NOW);
        assertThat(user.getUsername()).isEqualTo("deleted-7@deleted.invalid");
        assertThat(user.getName()).isEqualTo("Deleted user");
        assertThat(user.getFirebaseUid()).isNull();
        assertThat(user.getStripeCustomerId()).isNull();
        verify(auditEvents).deleteOfAccount(USER_ID, UID);
        verify(checkoutIntents).deleteOfUser(USER_ID);
        verify(sessionCache).evictUser(UID);
    }

    @Test
    void refusesASignInThatBelongsToSomeoneElse() {
        when(identityVerifier.verifyIdToken("token")).thenReturn(signIn("uid-other", NOW.minusSeconds(30)));

        assertThatThrownBy(() -> service.deleteAccount(new DeleteAccountRequest("token"), new MockHttpServletResponse()))
                .isInstanceOf(ForbiddenException.class);

        verifyNoInteractions(workspace, intelligence, paymentProcessor);
        verify(identityVerifier, never()).deleteUser(anyString());
    }

    @Test
    void refusesASignInOlderThanFiveMinutes() {
        when(identityVerifier.verifyIdToken("token")).thenReturn(signIn(UID, NOW.minusSeconds(6 * 60)));

        assertThatThrownBy(() -> service.deleteAccount(new DeleteAccountRequest("token"), new MockHttpServletResponse()))
                .isInstanceOf(ForbiddenException.class);

        verifyNoInteractions(workspace, intelligence, paymentProcessor);
        verify(userRepository, never()).save(any());
    }

    @Test
    void anotherServiceFailingLeavesTheAccountAsItWas() {
        when(identityVerifier.verifyIdToken("token")).thenReturn(signIn(UID, NOW.minusSeconds(30)));
        doThrow(mock(FeignException.class)).when(intelligence).deleteUserData(anyLong());

        assertThatThrownBy(() -> service.deleteAccount(new DeleteAccountRequest("token"), new MockHttpServletResponse()))
                .isInstanceOf(ExternalServiceException.class);

        verify(paymentProcessor, never()).cancelImmediately(anyLong());
        verify(identityVerifier, never()).deleteUser(anyString());
        verify(userRepository, never()).save(any());
        assertThat(user.getDeletedAt()).isNull();
        assertThat(user.getFirebaseUid()).isEqualTo(UID);
    }
}
