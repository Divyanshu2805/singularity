package com.java.vibecraft.llm;

import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Component;

/**
 * Bills a one-shot AI call to the caller's daily token usage. The chat pipeline records its own usage off the
 * stream's trailing chunk ({@code AiGenerationServiceImpl.finalizeChats}); the calls made before a project
 * even exists - naming it, and the idea interview - go through here, so they count the same way instead of
 * being invisible in {@code GET /api/usage/today}.
 *
 * <p>Reads the caller from the security context, so it only works on a request thread (not from a
 * {@code Schedulers.boundedElastic()} continuation, which is why the chat path passes its user id explicitly).
 * Never throws: failing to write a usage row must not fail the user's request.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AiUsageRecorder {

    private final UsageService usageService;
    private final AuthUtil authUtil;

    /** {@code label} only names the call in logs, e.g. "idea clarification". */
    public void record(ChatResponse response, String label) {
        try {
            Usage usage = response == null || response.getMetadata() == null ? null : response.getMetadata().getUsage();
            Integer totalTokens = usage == null ? null : usage.getTotalTokens();
            if (totalTokens == null || totalTokens <= 0) {
                log.debug("The {} call reported no token usage, nothing to record", label);
                return;
            }
            usageService.recordTokenUsage(authUtil.getCurrentUserId(), totalTokens);
        } catch (Exception e) {
            log.warn("Couldn't record token usage for the {} call", label, e);
        }
    }
}
