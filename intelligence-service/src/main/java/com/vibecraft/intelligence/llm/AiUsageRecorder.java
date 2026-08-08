package com.vibecraft.intelligence.llm;

import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.dto.usage.UsageReservation;
import com.vibecraft.intelligence.enums.UsageFeature;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.service.UsageService;
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
 * <p>Never throws: failing to write a usage row must not fail the user's request.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiUsageRecorder {

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
