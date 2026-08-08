package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.PlanDto;
import com.vibecraft.common.error.QuotaExceededException;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.entity.UsageEvent;
import com.vibecraft.intelligence.entity.UsageLog;
import com.vibecraft.intelligence.enums.UsageFeature;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.repository.UsageEventRepository;
import com.vibecraft.intelligence.repository.UsageLogRepository;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-13/AI-15: the daily budget must be claimed atomically before a call starts (not just
 * checked, which two concurrent calls can both pass before either has spent anything) and every counter write must
 * be a single UPDATE, never a read-then-save that can lose a concurrent increment. This exercises the sequencing and
 * arithmetic against a mocked repository; the atomicity of the UPDATE/UPSERT statements themselves is a database
 * property {@link UsageLogRepository}'s own SQL is responsible for, not something a mock can prove.
 */
class UsageServiceImplTest {

    private static final long USER_ID = 7L;
    private static final int MODEL_MAX_TOKENS = 32_000;

    private final UsageLogRepository usageLogRepository = mock(UsageLogRepository.class);
    private final UsageEventRepository usageEventRepository = mock(UsageEventRepository.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final UsageServiceImpl service = new UsageServiceImpl(
            usageLogRepository, usageEventRepository, accountServiceClient, workspaceServiceClient, authUtil, MODEL_MAX_TOKENS);

    private PlanDto plan(int maxTokensPerDay, boolean unlimited) {
        return new PlanDto(1L, "Pro", 10, maxTokensPerDay, 5, unlimited);
    }

    @Test
    void reservingClaimsTheModelsMaxTokensAtomicallyBeforeAnythingRuns() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(plan(100_000, false));
        when(usageLogRepository.tryReserve(eq(USER_ID), any(), eq(MODEL_MAX_TOKENS), eq(100_000))).thenReturn(1);

        UsageReservation reservation = service.reserveBudget();

        verify(usageLogRepository).ensureRowExists(eq(USER_ID), any());
        verify(usageLogRepository).tryReserve(eq(USER_ID), any(), eq(MODEL_MAX_TOKENS), eq(100_000));
        assertThat(reservation.userId()).isEqualTo(USER_ID);
        assertThat(reservation.tokens()).isEqualTo(MODEL_MAX_TOKENS);
    }

    @Test
    void aReservationLargerThanThePlansEntireDailyAllowanceIsCappedAtTheAllowanceInstead() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(plan(5_000, false)); // the free tier
        when(usageLogRepository.tryReserve(eq(USER_ID), any(), eq(5_000), eq(5_000))).thenReturn(1);

        UsageReservation reservation = service.reserveBudget();

        assertThat(reservation.tokens()).isEqualTo(5_000);
        verify(usageLogRepository).tryReserve(eq(USER_ID), any(), eq(5_000), eq(5_000));
    }

    @Test
    void aRejectedReservationThrowsQuotaExceededRatherThanSilentlyProceeding() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(plan(10_000, false));
        when(usageLogRepository.tryReserve(eq(USER_ID), any(), anyInt(), eq(10_000))).thenReturn(0);
        when(usageLogRepository.findByUserIdAndDate(eq(USER_ID), any())).thenReturn(java.util.Optional.empty());

        assertThatThrownBy(() -> service.reserveBudget())
                .isInstanceOf(QuotaExceededException.class);
    }

    @Test
    void anUnlimitedPlanReservesNothingAndNeverTouchesTheCounter() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(plan(100_000, true));

        UsageReservation reservation = service.reserveBudget();

        assertThat(reservation.tokens()).isZero();
        verifyNoInteractions(usageLogRepository);
    }

    @Test
    void reconcilingWithRealUsageAdjustsByTheDifferenceNotByAddingTheFullAmountAgain() {
        UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.of(2026, 1, 1), MODEL_MAX_TOKENS);
        UsageRecord actual = new UsageRecord(USER_ID, 5L, UsageFeature.BUILD, 800, 200, 1_000);

        service.reconcileBudget(reservation, actual);

        verify(usageLogRepository).adjust(USER_ID, reservation.date(), 1_000 - MODEL_MAX_TOKENS);
        verify(usageEventRepository).save(any(UsageEvent.class));
    }

    @Test
    void reconcilingWithNoUsageReleasesTheWholeReservationAndRecordsNoLedgerRow() {
        UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.of(2026, 1, 1), MODEL_MAX_TOKENS);

        service.reconcileBudget(reservation, null);

        verify(usageLogRepository).adjust(USER_ID, reservation.date(), -MODEL_MAX_TOKENS);
        verifyNoInteractions(usageEventRepository);
    }

    @Test
    void reconcilingAZeroTokenUnlimitedPlanReservationIsANoOp() {
        UsageReservation unlimited = new UsageReservation(USER_ID, LocalDate.now(), 0);

        service.reconcileBudget(unlimited, new UsageRecord(USER_ID, null, UsageFeature.BUILD, 10, 10, 20));

        verifyNoInteractions(usageLogRepository);
        verifyNoInteractions(usageEventRepository);
    }

    @Test
    void reconcilingANullReservationIsANoOp() {
        service.reconcileBudget(null, new UsageRecord(USER_ID, null, UsageFeature.BUILD, 10, 10, 20));

        verifyNoInteractions(usageLogRepository);
        verifyNoInteractions(usageEventRepository);
    }

    @Test
    void recordingUsageDirectlyIsAlsoAnAtomicUpsertNotAReadThenSave() {
        UsageRecord record = new UsageRecord(USER_ID, 5L, UsageFeature.BUILD_RETRY, 100, 50, 150);

        service.recordTokenUsage(record);

        verify(usageLogRepository).ensureRowExists(eq(USER_ID), any());
        verify(usageLogRepository).addTokens(eq(USER_ID), any(), eq(150));
        verify(usageLogRepository, never()).findByUserIdAndDate(eq(USER_ID), any());
        verify(usageLogRepository, never()).save(any(UsageLog.class));
        verify(usageEventRepository).save(any(UsageEvent.class));
    }
}
