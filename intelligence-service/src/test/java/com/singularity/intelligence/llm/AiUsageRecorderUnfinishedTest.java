package com.singularity.intelligence.llm;

import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.metadata.DefaultUsage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What a streamed answer costs when the reader walks away before it ends.
 *
 * <p>Handles: an answer cancelled after words were written is charged - by the provider's own count when one had
 * arrived, otherwise by an estimate from the prompt's and the answer's length; and one cancelled before a word was
 * written costs nothing.
 */
class AiUsageRecorderUnfinishedTest {

    private final UsageService usageService = mock(UsageService.class);
    private final AiUsageRecorder recorder = new AiUsageRecorder(usageService, mock(AuthUtil.class));
    private final UsageReservation reservation = mock(UsageReservation.class);

    @Test
    void anAnswerCancelledPartWayIsChargedByItsLength() {
        when(reservation.userId()).thenReturn(7L);

        recorder.reconcileUnfinished(reservation, null, UsageFeature.EXPLAIN, 3L, 8_000, 2_000);

        ArgumentCaptor<UsageRecord> charged = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService).reconcileBudget(eq(reservation), charged.capture());
        assertThat(charged.getValue().userId()).isEqualTo(7L);
        assertThat(charged.getValue().projectId()).isEqualTo(3L);
        assertThat(charged.getValue().inputTokens()).isEqualTo(2_000);
        assertThat(charged.getValue().outputTokens()).isEqualTo(500);
        assertThat(charged.getValue().totalTokens()).isEqualTo(2_500);
    }

    @Test
    void theProvidersOwnCountIsUsedWhenItHadArrived() {
        when(reservation.userId()).thenReturn(7L);

        recorder.reconcileUnfinished(reservation, new DefaultUsage(900, 100, 1_000), UsageFeature.EXPLAIN, 3L, 8_000, 2_000);

        ArgumentCaptor<UsageRecord> charged = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService).reconcileBudget(eq(reservation), charged.capture());
        assertThat(charged.getValue().totalTokens()).isEqualTo(1_000);
    }

    @Test
    void anAnswerCancelledBeforeAWordWasWrittenCostsNothing() {
        recorder.reconcileUnfinished(reservation, null, UsageFeature.EXPLAIN, 3L, 8_000, 0);

        verify(usageService).reconcileBudget(eq(reservation), isNull());
    }
}
