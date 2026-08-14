package com.vibecraft.account.repository;

import com.vibecraft.account.entity.WebhookEvent;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;

/**
 * The durable inbox that makes Stripe webhook processing idempotent.
 *
 * <p>Handles: atomically claiming an event id for processing (tryClaim) and marking one fully applied
 * (markProcessed). tryClaim is a single upsert rather than a JPA save() because save() would merge onto this
 * entity's manually-assigned id instead of inserting, which can never fail on a duplicate the way an insert can -
 * the whole point of the claim. It also doubles as the retry path: a delivery that only got as far as RECEIVED
 * (still in flight, or its handler threw) is reclaimable, so a duplicate delivery of a permanently-failed event is
 * not silently dropped forever.
 */
@Repository
public interface WebhookEventRepository extends JpaRepository<WebhookEvent, String> {

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO webhook_events (id, type, status, created_at, updated_at)
            VALUES (:id, :type, 'RECEIVED', :createdAt, now())
            ON CONFLICT (id) DO UPDATE SET status = 'RECEIVED', updated_at = now()
            WHERE webhook_events.status <> 'PROCESSED'
            """, nativeQuery = true)
    int tryClaim(@Param("id") String id, @Param("type") String type, @Param("createdAt") Instant createdAt);

    @Modifying
    @Transactional
    @Query("update WebhookEvent w set w.status = com.vibecraft.account.enums.WebhookEventStatus.PROCESSED where w.id = :id")
    void markProcessed(@Param("id") String id);
}
