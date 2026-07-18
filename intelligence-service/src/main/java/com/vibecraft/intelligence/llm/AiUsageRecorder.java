package com.vibecraft.intelligence.llm;

import com.vibecraft.intelligence.dto.usage.UsageRecord;
import com.vibecraft.intelligence.enums.UsageFeature;
import com.vibecraft.intelligence.security.AuthUtil;
import com.vibecraft.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Component;

/**
 * Bills an AI call to a user's usage - the daily counter quotas read, and the ledger insights read.
 *
 * <p><b>Two forms, and which one to use matters.</b> {@link #record(ChatResponse, UsageFeature, Long)} reads the
 * caller from the security context, so it is only correct on a request thread. Anything that records from a
 * stream's completion - a Reactor continuation with no signed-in user - must capture the user id on the request
 * thread first and call {@link #record(ChatResponse, UsageFeature, Long, Long)}. ExplainLLM streaming used the
 * context-reading form from {@code doOnComplete}; the lookup threw, this class swallowed it, and those tokens
 * were never billed.
 *
 * <p>Never throws: failing to write a usage row must not fail the user's request.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiUsageRecorder {

    private final UsageService usageService;
    private final AuthUtil authUtil;

    /** For request-thread callers. {@code projectId} is null for calls made before a project exists. */
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

    /** For anything recording after the request thread has gone - a stream's completion, a background retry. */
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

    private static int orZero(Integer value) {
        return value == null ? 0 : value;
    }
}
