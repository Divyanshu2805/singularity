package com.singularity.account.service.impl;

import com.singularity.account.dto.auth.DeleteAccountRequest;
import com.singularity.account.entity.User;
import com.singularity.account.feign.IntelligenceServiceClient;
import com.singularity.account.feign.WorkspaceServiceClient;
import com.singularity.account.repository.AuthAuditEventRepository;
import com.singularity.account.repository.CheckoutIntentRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.security.SessionEvictionNotifier;
import com.singularity.account.service.AccountDeletionService;
import com.singularity.account.service.PaymentProcessor;
import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.error.ForbiddenException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.common.security.IdentityVerifier;
import com.singularity.common.security.SessionCache;
import com.singularity.common.security.SessionCookies;
import com.singularity.common.security.UserPrincipal;
import com.singularity.common.security.VerifiedIdentity;
import feign.FeignException;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AccessLevel;
import lombok.RequiredArgsConstructor;
import lombok.experimental.FieldDefaults;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;

/**
 * Deletes the signed-in account and everything in it, across every service.
 *
 * <p>Handles: checking that the ID token sent with the request is the caller's own and from a sign-in made in the last
 * five minutes; having workspace-service delete or leave every project of the account (stopping previews and taking
 * published apps down), delete its invitations and forget its GitHub connection; having intelligence-service delete
 * its chats, notes, tours, glossary and usage; cancelling a paid subscription at once; deleting the Firebase user;
 * emptying the account's row and deleting its security trail and checkout intent; and ending every cached session.
 *
 * <p>Why a fresh sign-in. A session cookie lives for days, so a device left signed in would otherwise be enough to
 * delete someone's account. The browser signs in again just before asking, as it does before a security change.
 *
 * <p>Order. Every step can be repeated, and the steps run from what is easiest to repeat to what ends the person's
 * ability to ask again. The other services' data goes first: if either call fails nothing here has changed, the
 * account still works and the person can press the button again. The subscription is cancelled next, then the
 * Firebase user is deleted - after which nobody can sign in as this account - and last the row is emptied: its
 * address, name, Firebase uid and Stripe customer are replaced or cleared and deletedAt is set, so the address is free
 * for a new account and the old uid resolves to nobody in any service. The row itself stays, because other services
 * hold its id (a revision's author, a usage figure already summed) and a soft-deleted user is how the schema says
 * "gone". The customer and its invoices stay in Stripe, which keeps payment records for the business; only the link
 * from this account to it is removed.
 *
 * <p>Deliberately not transactional, like SessionServiceImpl: the calls out would hold a database connection for
 * their whole duration, and each local write is atomic on its own.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@FieldDefaults(makeFinal = true, level = AccessLevel.PRIVATE)
public class AccountDeletionServiceImpl implements AccountDeletionService {

    static final Duration MAX_CONFIRMATION_AGE = Duration.ofMinutes(5);

    static final String DELETED_NAME = "Deleted user";

    AuthUtil authUtil;
    IdentityVerifier identityVerifier;
    UserRepository userRepository;
    AuthAuditEventRepository authAuditEventRepository;
    CheckoutIntentRepository checkoutIntentRepository;
    WorkspaceServiceClient workspaceServiceClient;
    IntelligenceServiceClient intelligenceServiceClient;
    PaymentProcessor paymentProcessor;
    SessionCache sessionCache;
    SessionEvictionNotifier sessionEvictionNotifier;
    SessionCookies sessionCookies;
    Clock clock;

    @Override
    public void deleteAccount(DeleteAccountRequest request, HttpServletResponse httpResponse) {
        UserPrincipal principal = authUtil.getCurrentPrincipal();
        if (principal.firebaseUid() == null) {
            throw new BadRequestException("Deleting an account needs a Firebase sign-in. Sign in again and retry.");
        }
        VerifiedIdentity identity = identityVerifier.verifyIdToken(request.idToken());
        if (!identity.uid().equals(principal.firebaseUid())) {
            throw new ForbiddenException("That sign-in belongs to a different account.");
        }
        if (identity.authTime() == null || identity.authTime().isBefore(clock.instant().minus(MAX_CONFIRMATION_AGE))) {
            throw new ForbiddenException("Confirm it's you again, then delete your account within five minutes.");
        }

        User user = userRepository.findById(principal.userId())
                .filter(found -> found.getDeletedAt() == null)
                .orElseThrow(() -> new ResourceNotFoundException("User", principal.userId().toString()));
        Long userId = user.getId();
        String firebaseUid = user.getFirebaseUid();

        try {
            workspaceServiceClient.deleteUserData(userId, new DeleteUserDataRequest(user.getUsername()));
            intelligenceServiceClient.deleteUserData(userId);
        } catch (FeignException e) {
            throw new ExternalServiceException("Couldn't delete the data of user " + userId + " in another service", e);
        }
        paymentProcessor.cancelImmediately(userId);
        identityVerifier.deleteUser(firebaseUid);

        user.setUsername("deleted-" + userId + "@deleted.invalid");
        user.setName(DELETED_NAME);
        user.setFirebaseUid(null);
        user.setStripeCustomerId(null);
        user.setDeletedAt(clock.instant());
        userRepository.save(user);
        authAuditEventRepository.deleteOfAccount(userId, firebaseUid);
        checkoutIntentRepository.deleteOfUser(userId);

        sessionCache.evictUser(firebaseUid);
        sessionEvictionNotifier.evictUser(firebaseUid);
        sessionCookies.clear(httpResponse);
        log.info("Deleted account {}", userId);
    }
}
