package com.singularity.account.service.impl;

import com.singularity.account.entity.User;
import com.singularity.account.feign.IntelligenceServiceClient;
import com.singularity.account.feign.WorkspaceServiceClient;
import com.singularity.account.repository.AuthAuditEventRepository;
import com.singularity.account.repository.UserRepository;
import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.common.security.DemoAccount;
import com.singularity.common.security.IdentityVerifier;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Putting the shared demo account back: the Firebase user made again first, the row found or made, everything the last
 * visitor left deleted in the other services, then the sample project made and built - and a failure part way leaving
 * an account that can still sign in, for the next run to finish.
 */
class DemoAccountServiceImplTest {

    private static final String UID = "singularity-demo";
    private static final String EMAIL = "demo@singularity.dev";
    private static final long USER_ID = 5L;
    private static final long PROJECT_ID = 31L;

    private final IdentityVerifier identityVerifier = mock(IdentityVerifier.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final AuthAuditEventRepository authAuditEventRepository = mock(AuthAuditEventRepository.class);
    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final IntelligenceServiceClient intelligenceServiceClient = mock(IntelligenceServiceClient.class);

    private final DemoAccountServiceImpl service = new DemoAccountServiceImpl(new DemoAccount(UID), identityVerifier,
            userRepository, authAuditEventRepository, workspaceServiceClient, intelligenceServiceClient, EMAIL,
            "demo1234");

    DemoAccountServiceImplTest() {
        when(userRepository.save(any(User.class))).thenAnswer(call -> {
            User user = call.getArgument(0);
            if (user.getId() == null) user.setId(USER_ID);
            return user;
        });
        when(workspaceServiceClient.createDemoProject(anyLong(), any())).thenReturn(
                new ProjectSummaryDto(PROJECT_ID, "quick-notes", false, false, null, DemoAccountServiceImpl.SAMPLE_TITLE));
    }

    @Test
    void makesTheAccountFromNothingInOrder() {
        when(userRepository.findByFirebaseUid(UID)).thenReturn(Optional.empty());
        when(userRepository.findByUsername(EMAIL)).thenReturn(Optional.empty());

        service.reset();

        InOrder order = inOrder(identityVerifier, userRepository, workspaceServiceClient, intelligenceServiceClient,
                authAuditEventRepository);
        order.verify(identityVerifier).recreateUser(UID, EMAIL, "demo1234", DemoAccountServiceImpl.NAME);
        order.verify(userRepository).save(any(User.class));
        order.verify(workspaceServiceClient).deleteUserData(USER_ID, new DeleteUserDataRequest(EMAIL));
        order.verify(intelligenceServiceClient).deleteUserData(USER_ID);
        order.verify(workspaceServiceClient).createDemoProject(USER_ID,
                new ProjectTitleDto(DemoAccountServiceImpl.SAMPLE_TITLE));
        order.verify(intelligenceServiceClient).recordDemoBuild(PROJECT_ID, USER_ID);
        order.verify(authAuditEventRepository).deleteOfAccount(USER_ID, UID);
    }

    @Test
    void putsBackTheNameOfTheRowItAlreadyHas() {
        User existing = User.builder().id(USER_ID).username(EMAIL).name("Renamed by a visitor").firebaseUid(UID).build();
        when(userRepository.findByFirebaseUid(UID)).thenReturn(Optional.of(existing));

        service.reset();

        assertThat(existing.getName()).isEqualTo(DemoAccountServiceImpl.NAME);
        assertThat(existing.getUsername()).isEqualTo(EMAIL);
        verify(userRepository, never()).findByUsername(any());
    }

    @Test
    void aDeletedRowIsNotTheDemoAccount() {
        User deleted = User.builder().id(2L).username(EMAIL).firebaseUid(UID).deletedAt(Instant.EPOCH).build();
        when(userRepository.findByFirebaseUid(UID)).thenReturn(Optional.of(deleted));
        when(userRepository.findByUsername(EMAIL)).thenReturn(Optional.empty());

        assertThat(service.exists()).isFalse();
        service.reset();

        assertThat(deleted.getName()).isNull();
        verify(workspaceServiceClient).deleteUserData(USER_ID, new DeleteUserDataRequest(EMAIL));
    }

    @Test
    void aFailureInAnotherServiceStopsBeforeTheSampleIsMade() {
        when(userRepository.findByFirebaseUid(UID)).thenReturn(Optional.empty());
        when(userRepository.findByUsername(EMAIL)).thenReturn(Optional.empty());
        doThrow(new ExternalServiceException("down", null)).when(intelligenceServiceClient).deleteUserData(USER_ID);

        assertThatThrownBy(service::reset).isInstanceOf(ExternalServiceException.class);

        verify(identityVerifier).recreateUser(any(), any(), any(), any());
        verify(workspaceServiceClient, never()).createDemoProject(anyLong(), any());
    }
}
