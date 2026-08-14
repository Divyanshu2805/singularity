package com.vibecraft.account.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * A user's one outstanding Stripe Checkout attempt.
 *
 * <p>Handles: the idempotency key a checkout-session creation is retried under, and the Stripe session id it minted
 * once created - so a double click or a parallel tab reuses the same in-flight session instead of starting a second
 * one. Keyed on user_id itself (not a surrogate id): at most one outstanding intent per user, enforced by the primary
 * key rather than a race-prone existence check.
 *
 * <p>updatedAt refreshes on every reuse, not just on insert, since it also marks when the intent was last minted -
 * that is what decides whether a stale intent (older than the Checkout Session's own ~24h expiry) gets thrown away
 * for a fresh idempotency key instead of being reused.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "checkout_intents")
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class CheckoutIntent {

    @Id
    @Column(name = "user_id")
    Long userId;

    @Column(nullable = false)
    Long planId;

    @Column(nullable = false)
    String idempotencyKey;

    String stripeSessionId;

    @UpdateTimestamp
    Instant updatedAt;
}
