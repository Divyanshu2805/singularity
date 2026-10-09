package com.singularity.account.controller;

import com.singularity.account.entity.User;
import com.singularity.account.repository.RevokedSessionRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.account.service.SubscriptionService;
import com.singularity.common.error.ResourceNotFoundException;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * A deleted account cannot authenticate a session on any service.
 *
 * <p>Handles: the lookup by Firebase uid - the one workspace-service and intelligence-service resolve every session
 * through - answers not-found for a deleted account and still resolves a live one; the lookup by id, which only
 * names a member, still returns a deleted account.
 */
class InternalAccountControllerDeletedUserTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final InternalAccountController controller = new InternalAccountController(
            userRepository, mock(RevokedSessionRepository.class), mock(SubscriptionService.class));

    private static User user(Instant deletedAt) {
        return User.builder().id(7L).username("a@example.com").name("A").firebaseUid("uid-1").deletedAt(deletedAt).build();
    }

    @Test
    void aDeletedAccountDoesNotResolveByFirebaseUid() {
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.of(user(Instant.parse("2026-10-01T00:00:00Z"))));

        assertThatThrownBy(() -> controller.getUserByFirebaseUid("uid-1")).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void aLiveAccountResolvesByFirebaseUid() {
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.of(user(null)));

        assertThat(controller.getUserByFirebaseUid("uid-1").id()).isEqualTo(7L);
    }

    @Test
    void aDeletedAccountCanStillBeNamedById() {
        when(userRepository.findById(7L)).thenReturn(Optional.of(user(Instant.parse("2026-10-01T00:00:00Z"))));

        assertThat(controller.getUser(7L).name()).isEqualTo("A");
    }
}
