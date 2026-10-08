package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.UsageEvent;
import com.singularity.intelligence.entity.UsageLog;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.repository.UsageEventRepository;
import com.singularity.intelligence.repository.UsageLogRepository;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers the daily budget: what is charged, what is only held, and what the meter is told.
 *
 * <p>Each case is a way the allowance was or could be got wrong. A hold counted as spending made the meter jump by
 * sixty thousand tokens at the start of every build and fall back afterwards, and refused a build with most of the
 * day left; a turn nobody watched after admitting it finished past the limit; an unlimited plan's calls were let
 * through with a reservation the charge then skipped, so nothing of theirs was recorded. The counter here is a number
 * the fake repository adds to, so a case can ask what a second call sees after a first one has been charged; that
 * the UPDATE itself is atomic is a property of {@link UsageLogRepository}'s SQL, not something a mock can prove.
 */
class UsageServiceImplTest {

    private static final long USER_ID = 7L;
    private static final int BUILD_HOLD = 60_000;
    private static final int LIGHT_HOLD = 4_000;
    private static final int BUILD_MINIMUM = 10_000;
    private static final int LIGHT_MINIMUM = 1_500;

    private final UsageLogRepository usageLogRepository = mock(UsageLogRepository.class);
    private final UsageEventRepository usageEventRepository = mock(UsageEventRepository.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final AtomicInteger spent = new AtomicInteger();

    private final UsageServiceImpl service = new UsageServiceImpl(
            usageLogRepository, usageEventRepository, accountServiceClient, workspaceServiceClient, authUtil,
            new BudgetHolds(Clock.systemUTC()), new TransactionTemplate(mock(PlatformTransactionManager.class)),
            BUILD_HOLD, LIGHT_HOLD, BUILD_MINIMUM, LIGHT_MINIMUM);

    UsageServiceImplTest() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(usageLogRepository.findTokensUsed(eq(USER_ID), any())).thenAnswer(call -> Optional.of(spent.get()));
        doAnswer(call -> spent.addAndGet(call.getArgument(2))).when(usageLogRepository).addTokens(eq(USER_ID), any(), anyInt());
        when(usageEventRepository.findFirstByUserIdOrderByCreatedAtDescIdDesc(USER_ID)).thenReturn(Optional.empty());
    }

    private void planAllows(int maxTokensPerDay) {
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Pro", 10, maxTokensPerDay, 5, false));
    }

    private void planIsUnlimited() {
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Team", 10, 100_000, 5, true));
    }

    private static UsageRecord cost(int total) {
        return new UsageRecord(USER_ID, 5L, UsageFeature.BUILD, total - total / 4, total / 4, total);
    }

    private int shownOnTheMeter() {
        return service.getTodayUsageOfUser(null).tokensUsed();
    }

    @Test
    void admittingABuildHoldsPartOfTheAllowanceAndChargesNothing() {
        planAllows(100_000);

        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(reservation.userId()).isEqualTo(USER_ID);
        assertThat(reservation.tokens()).isEqualTo(BUILD_HOLD);
        assertThat(reservation.holdId()).isPositive();
        verify(usageLogRepository, never()).addTokens(any(), any(), anyInt());
        verify(usageLogRepository, never()).ensureRowExists(any(), any());
    }

    @Test
    void aHoldIsNeverShownOnTheMeterAsIfItHadBeenSpent() {
        planAllows(100_000);
        spent.set(12_000);

        service.reserveBudget(UsageFeature.BUILD);

        assertThat(shownOnTheMeter()).isEqualTo(12_000);
    }

    @Test
    void aBuildIsAdmittedWithLittleLeftAndGrantedOnlyWhatIsFree() {
        planAllows(100_000);
        spent.set(85_000);

        assertThat(service.reserveBudget(UsageFeature.BUILD).tokens()).isEqualTo(15_000);
    }

    @Test
    void aBuildIsRefusedOnlyWhenLessThanTheMinimumIsFreeAndTheRefusalSaysWhich() {
        planAllows(100_000);
        spent.set(92_000);

        assertThatThrownBy(() -> service.reserveBudget(UsageFeature.BUILD))
                .isInstanceOf(QuotaExceededException.class)
                .hasMessageContaining("isn't enough of today's AI allowance left");

        spent.set(100_000);
        assertThatThrownBy(() -> service.reserveBudget(UsageFeature.BUILD))
                .isInstanceOf(QuotaExceededException.class)
                .hasMessageContaining("You've used today's AI allowance");
    }

    @Test
    void theIdeaInterviewAndCodeLensNeedAndHoldFarLessThanABuild() {
        planAllows(100_000);
        spent.set(96_000);

        assertThat(service.reserveBudget(UsageFeature.IDEA_INTERVIEW).tokens()).isEqualTo(LIGHT_HOLD);
        assertThatThrownBy(() -> service.reserveBudget(UsageFeature.EXPLAIN)).isInstanceOf(QuotaExceededException.class);
    }

    @Test
    void twoCallsOfOneUserCannotHoldTheSameRoom() {
        planAllows(100_000);
        spent.set(30_000);

        assertThat(service.reserveBudget(UsageFeature.BUILD).tokens()).isEqualTo(60_000);
        assertThat(service.reserveBudget(UsageFeature.BUILD).tokens()).isEqualTo(10_000);
        assertThatThrownBy(() -> service.reserveBudget(UsageFeature.BUILD)).isInstanceOf(QuotaExceededException.class);
    }

    @Test
    void aPlanSmallerThanTheMinimumCanStillMakeItsCall() {
        planAllows(5_000);

        assertThat(service.reserveBudget(UsageFeature.BUILD).tokens()).isEqualTo(5_000);
    }

    @Test
    void theMeterRisesWithACallsEstimatedSpendAndSettlesOnWhatTheProviderReports() {
        planAllows(100_000);
        spent.set(20_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.exceedsBudget(reservation, 7_000)).isFalse();
        assertThat(shownOnTheMeter()).isEqualTo(27_000);
        assertThat(service.exceedsBudget(reservation, 9_500)).isFalse();
        assertThat(shownOnTheMeter()).isEqualTo(29_500);

        service.settleCall(reservation, cost(9_100), 0);

        assertThat(spent.get()).isEqualTo(29_100);
        assertThat(shownOnTheMeter()).isEqualTo(29_100);
        verify(usageEventRepository).save(any(UsageEvent.class));
    }

    @Test
    void aHoldGrowsWhileThereIsAllowanceToGrowIntoAndTheCallIsOverBudgetOnlyWhenThereIsNone() {
        planAllows(100_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.exceedsBudget(reservation, 61_000)).isFalse();
        assertThat(service.exceedsBudget(reservation, 99_900)).isFalse();
        assertThat(service.exceedsBudget(reservation, 100_200)).isTrue();
        assertThat(shownOnTheMeter()).isEqualTo(100_000);
    }

    @Test
    void aCallAdmittedWithLittleLeftIsOverBudgetTheMomentItsEstimatePassesWhatWasLeft() {
        planAllows(100_000);
        spent.set(85_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.exceedsBudget(reservation, 14_800)).isFalse();
        assertThat(service.exceedsBudget(reservation, 15_200)).isTrue();
        assertThat(shownOnTheMeter()).isEqualTo(100_000);
    }

    @Test
    void aHoldCannotGrowIntoRoomAnotherCallIsHolding() {
        planAllows(100_000);
        spent.set(30_000);
        UsageReservation first = service.reserveBudget(UsageFeature.BUILD);
        service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.exceedsBudget(first, 60_500)).isTrue();
    }

    @Test
    void settlingACallSaysWhetherThereIsRoomForAnother() {
        planAllows(100_000);
        spent.set(85_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.settleCall(reservation, cost(9_000), 5_000)).isFalse();
        assertThat(spent.get()).isEqualTo(94_000);
        assertThat(service.settleCall(reservation, cost(2_000), 5_000)).isTrue();
        assertThat(spent.get()).isEqualTo(96_000);
    }

    @Test
    void whatACallDidNotSpendOfItsHoldIsFreeAgainOnceItIsClosed() {
        planAllows(100_000);
        spent.set(30_000);
        UsageReservation first = service.reserveBudget(UsageFeature.BUILD);

        service.reconcileBudget(first, cost(8_000));

        assertThat(spent.get()).isEqualTo(38_000);
        assertThat(service.reserveBudget(UsageFeature.BUILD).tokens()).isEqualTo(60_000);
    }

    @Test
    void releasingAHoldForACallThatProducedNothingChargesNothingAndWritesNoLedgerRow() {
        planAllows(100_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.EXPLAIN);

        service.reconcileBudget(reservation, null);

        assertThat(spent.get()).isZero();
        verifyNoInteractions(usageEventRepository);
        assertThat(service.exceedsBudget(reservation, 500_000)).isFalse();
    }

    @Test
    void theMeterNeverShowsMoreThanTheLimitEvenWhenACallWasChargedALittlePastIt() {
        planAllows(100_000);
        spent.set(98_000);
        UsageReservation reservation = service.reserveBudget(UsageFeature.EXPLAIN);

        service.reconcileBudget(reservation, cost(3_400));

        assertThat(spent.get()).isEqualTo(101_400);
        assertThat(shownOnTheMeter()).isEqualTo(100_000);
        assertThat(service.getTodayUsageOfUser(null).buildMinimumTokens()).isEqualTo(BUILD_MINIMUM);
    }

    @Test
    void anUnlimitedPlanIsNeverRefusedOrStoppedButItsCallsAreStillCharged() {
        planIsUnlimited();
        spent.set(900_000);

        UsageReservation reservation = service.reserveBudget(UsageFeature.BUILD);

        assertThat(service.exceedsBudget(reservation, 5_000_000)).isFalse();
        assertThat(service.settleCall(reservation, cost(40_000), 50_000)).isFalse();
        assertThat(spent.get()).isEqualTo(940_000);
        verify(usageEventRepository).save(any(UsageEvent.class));
        assertThat(shownOnTheMeter()).isEqualTo(940_000);
    }

    @Test
    void aReservationNothingIsTrackingIsStillChargedAndNeverStopsACall() {
        UsageReservation untracked = new UsageReservation(USER_ID, LocalDate.of(2026, 1, 1), 60_000);

        assertThat(service.exceedsBudget(untracked, 10_000_000)).isFalse();
        assertThat(service.settleCall(untracked, cost(1_000), 50_000)).isFalse();

        assertThat(spent.get()).isEqualTo(1_000);
        verify(usageLogRepository).ensureRowExists(eq(USER_ID), any());
    }

    @Test
    void settlingWithNoReservationAtAllIsANoOp() {
        service.reconcileBudget(null, cost(20));
        assertThat(service.settleCall(null, cost(20), 0)).isFalse();
        assertThat(service.exceedsBudget(null, 20)).isFalse();

        verifyNoInteractions(usageLogRepository);
        verifyNoInteractions(usageEventRepository);
    }

    @Test
    void recordingUsageDirectlyIsAnAtomicAddNotAReadThenSave() {
        UsageRecord record = new UsageRecord(USER_ID, 5L, UsageFeature.BUILD_RETRY, 100, 50, 150);

        service.recordTokenUsage(record);

        verify(usageLogRepository).ensureRowExists(eq(USER_ID), any());
        verify(usageLogRepository, times(1)).addTokens(eq(USER_ID), any(), eq(150));
        verify(usageLogRepository, never()).findByUserIdAndDate(eq(USER_ID), any());
        verify(usageLogRepository, never()).save(any(UsageLog.class));
        verify(usageEventRepository).save(any(UsageEvent.class));
    }
}
