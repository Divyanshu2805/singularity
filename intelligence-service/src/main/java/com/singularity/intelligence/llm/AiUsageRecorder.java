package com.singularity.intelligence.llm;

import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Component;

/**
 * Bills an AI call to a user's usage - the daily counter quotas read, and the ledger insights read.
 *
 * <p>Handles: pulling the token counts off a model response and writing them, in two forms - a direct, un-reserved
 * record, and reconciling a {@link UsageReservation} claimed by {@code UsageService.reserveBudget} before the call
 * started, either to its real cost or, on {@code release}, back to nothing for a call that produced no chargeable
 * output.
 *
 * <p>Which form matters. The one that reads the caller from the security context is only correct on a request thread;
 * anything recording from a stream's completion - a continuation with no signed-in user - must capture the user id on
 * the request thread first and pass it in. The code lens once used the context-reading form from a stream completion:
 * the lookup threw, this class swallowed it, and those tokens were never billed. A reservation already carries its
 * user id for exactly this reason, so every reconcile/release call is safe off the request thread.
 *
 * <p>A streamed answer whose reader went away before the end is still charged ({@code reconcileUnfinished}). Such a
 * call used to be released like one that never ran, so closing the connection a moment before the last word made
 * every explanation, answer and lesson free, and the daily allowance could not stop it. The provider's own count is
 * used when it had already arrived; it usually comes with the last chunk, so otherwise the cost is estimated from the
 * length of the prompt and of what was written, at four characters a token. An estimate, and on the low side when
 * the model read files - but no longer nothing. A call cancelled before it wrote a word is released as before.
 *
 * <p>Never throws: failing to write a usage row must not fail the user's request.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiUsageRecorder {

    private static final int CHARS_PER_TOKEN = 4;

    private final UsageService usageService;
    private final AuthUtil authUtil;

    public void record(ChatResponse response, UsageFeature feature, Long projectId) {
        Long userId;
        try {
            userId = authUtil.getCurrentUserId();
        } catch (Exception e) {
            log.warn("Couldn't identify the caller to record {} usage - called off the request thread?", feature, e);
            return;
        }
        record(response, feature, userId, projectId);
    }

    public void record(ChatResponse response, UsageFeature feature, Long userId, Long projectId) {
        try {
            Usage usage = response == null || response.getMetadata() == null ? null : response.getMetadata().getUsage();
            record(usage, feature, userId, projectId);
        } catch (Exception e) {
            log.warn("Couldn't record token usage for {}", feature, e);
        }
    }

    public void record(Usage usage, UsageFeature feature, Long userId, Long projectId) {
        try {
            Integer total = usage == null ? null : usage.getTotalTokens();
            if (total == null || total <= 0) {
                log.debug("The {} call reported no token usage, nothing to record", feature);
                return;
            }
            usageService.recordTokenUsage(new UsageRecord(
                    userId, projectId, feature, orZero(usage.getPromptTokens()), orZero(usage.getCompletionTokens()), total));
        } catch (Exception e) {
            log.warn("Couldn't record token usage for {}", feature, e);
        }
    }

    public void reconcile(UsageReservation reservation, ChatResponse response, UsageFeature feature, Long projectId) {
        Usage usage = response == null || response.getMetadata() == null ? null : response.getMetadata().getUsage();
        reconcile(reservation, usage, feature, projectId);
    }

    public void reconcile(UsageReservation reservation, Usage usage, UsageFeature feature, Long projectId) {
        try {
            usageService.reconcileBudget(reservation, toRecord(reservation, usage, feature, projectId));
        } catch (Exception e) {
            log.warn("Couldn't reconcile token usage for {}", feature, e);
        }
    }

    public void reconcileUnfinished(UsageReservation reservation, Usage reported, UsageFeature feature, Long projectId,
                                    int promptChars, int writtenChars) {
        Integer total = reported == null ? null : reported.getTotalTokens();
        if (total != null && total > 0) {
            reconcile(reservation, reported, feature, projectId);
            return;
        }
        if (writtenChars <= 0) {
            release(reservation);
            return;
        }
        int input = Math.max(1, promptChars / CHARS_PER_TOKEN);
        int output = Math.max(1, writtenChars / CHARS_PER_TOKEN);
        try {
            usageService.reconcileBudget(reservation,
                    new UsageRecord(reservation.userId(), projectId, feature, input, output, input + output));
        } catch (Exception e) {
            log.warn("Couldn't record the usage of an unfinished {} call", feature, e);
        }
    }

    public void release(UsageReservation reservation) {
        try {
            usageService.reconcileBudget(reservation, null);
        } catch (Exception e) {
            log.warn("Couldn't release an unused usage reservation", e);
        }
    }

    private UsageRecord toRecord(UsageReservation reservation, Usage usage, UsageFeature feature, Long projectId) {
        Integer total = usage == null ? null : usage.getTotalTokens();
        if (total == null || total <= 0) {
            return null;
        }
        return new UsageRecord(
                reservation.userId(), projectId, feature, orZero(usage.getPromptTokens()), orZero(usage.getCompletionTokens()), total);
    }

    private static int orZero(Integer value) {
        return value == null ? 0 : value;
    }
}
