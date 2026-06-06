package com.java.vibecraft.config;

import com.java.vibecraft.entity.UsageEvent;
import com.java.vibecraft.enums.UsageFeature;
import com.java.vibecraft.repository.UsageEventRepository;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Gives the usage ledger a history, once.
 *
 * <p>The ledger only exists from 2026-09-16, but build chats have always stored their token counts on
 * {@code chat_messages}: prompt tokens on the user's turn, completion tokens on the assistant's reply. This turns
 * each such pair into a {@code BUILD} event at the reply's own time, so insights open on real history instead of
 * an empty chart that suggests nobody had used the product.
 *
 * <p>Only what can be attributed is created. ExplainLLM, the idea interview and naming were only ever added to
 * the daily total, so they can't be recovered; the insights service reports whatever the daily totals hold beyond
 * the ledger as "earlier activity" rather than guessing which feature it was.
 *
 * <p>Runs only while the ledger is empty, so it can't duplicate anything - after the first boot, or once any new
 * call has been recorded, it does nothing.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class UsageLedgerBackfill implements ApplicationRunner {

    private final UsageEventRepository usageEventRepository;
    private final EntityManager entityManager;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (usageEventRepository.count() > 0) {
            return;
        }

        @SuppressWarnings("unchecked")
        List<Object[]> rows = entityManager.createNativeQuery("""
                select user_id, project_id, role, tokens_used, created_at
                from chat_messages
                where role in ('USER', 'ASSISTANT')
                order by project_id, user_id, id
                """).getResultList();

        List<UsageEvent> events = pairTurns(rows);
        usageEventRepository.saveAll(events);
        log.info("Usage ledger backfilled with {} build turns from chat history", events.size());
    }

    /**
     * A user turn opens a build; the assistant reply that follows it in the same chat closes it. A reply with no
     * preceding user turn still counts its own tokens, and a user turn nobody answered (a failed request) counts
     * nothing - no response means no completion usage was ever recorded for it.
     */
    static List<UsageEvent> pairTurns(List<Object[]> rows) {
        List<UsageEvent> events = new ArrayList<>();
        Long openUser = null;
        Long openProject = null;
        int openPrompt = 0;

        for (Object[] row : rows) {
            Long userId = toLong(row[0]);
            Long projectId = toLong(row[1]);
            String role = String.valueOf(row[2]);
            int tokens = row[3] == null ? 0 : ((Number) row[3]).intValue();

            boolean sameChat = userId != null && userId.equals(openUser) && projectId != null && projectId.equals(openProject);

            if ("USER".equals(role)) {
                openUser = userId;
                openProject = projectId;
                openPrompt = tokens;
                continue;
            }

            int prompt = sameChat ? openPrompt : 0;
            int total = prompt + tokens;
            if (total > 0) {
                events.add(UsageEvent.builder()
                        .userId(userId)
                        .projectId(projectId)
                        .feature(UsageFeature.BUILD.name())
                        .inputTokens(prompt)
                        .outputTokens(tokens)
                        .totalTokens(total)
                        .createdAt(toInstant(row[4]))
                        .build());
            }
            openUser = null;
            openProject = null;
            openPrompt = 0;
        }
        return events;
    }

    private static Long toLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static Instant toInstant(Object value) {
        if (value instanceof Instant instant) return instant;
        if (value instanceof OffsetDateTime offset) return offset.toInstant();
        if (value instanceof Timestamp timestamp) return timestamp.toInstant();
        return Instant.now();
    }
}
