package com.vibecraft.account.repository;

import com.vibecraft.account.entity.CheckoutIntent;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;

/**
 * Reads and writes each user's outstanding checkout intent.
 *
 * <p>Handles: atomically claiming or refreshing the one intent row a user can have (claimOrRefresh) and recording
 * the Stripe session it minted (recordSession). Both go through native upserts rather than JpaRepository.save():
 * this entity's id is manually assigned (userId), so Spring Data's default new-entity check treats it as "not new"
 * and routes save() through entityManager.merge() - an upsert that can silently overwrite a concurrent request's
 * row instead of ever failing, which defeats the whole point of a claim. See CLAUDE.md's gotchas table.
 */
@Repository
public interface CheckoutIntentRepository extends JpaRepository<CheckoutIntent, Long> {

    /**
     * Inserts a fresh intent for a user with none yet, or replaces an existing one that is stale or targets a
     * different plan - in one atomic statement, so two concurrent callers can never mint two different idempotency
     * keys for the same user. A caller whose own values lost the race (the existing row was already fresh and on
     * the same plan) sees 0 rows affected and must re-read the row by id to pick up whichever key won.
     */
    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO checkout_intents (user_id, plan_id, idempotency_key, stripe_session_id, updated_at)
            VALUES (:userId, :planId, :idempotencyKey, NULL, now())
            ON CONFLICT (user_id) DO UPDATE SET
                plan_id = :planId,
                idempotency_key = :idempotencyKey,
                stripe_session_id = NULL,
                updated_at = now()
            WHERE checkout_intents.plan_id <> :planId OR checkout_intents.updated_at < :staleThreshold
            """, nativeQuery = true)
    int claimOrRefresh(@Param("userId") Long userId, @Param("planId") Long planId,
                        @Param("idempotencyKey") String idempotencyKey, @Param("staleThreshold") Instant staleThreshold);

    /**
     * Records the Stripe session an idempotency key minted - only while that key is still the row's current one, so
     * a write from an intent that's since been reset (a later claimOrRefresh) can never clobber the reset.
     */
    @Modifying
    @Transactional
    @Query("update CheckoutIntent c set c.stripeSessionId = :sessionId where c.userId = :userId and c.idempotencyKey = :idempotencyKey")
    void recordSession(@Param("userId") Long userId, @Param("idempotencyKey") String idempotencyKey,
                        @Param("sessionId") String sessionId);
}
