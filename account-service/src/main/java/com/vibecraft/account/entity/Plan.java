package com.vibecraft.account.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "plans")
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Plan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(nullable = false)
    String name;

    /**
     * The Stripe recurring price this plan checks out against. Null on the free plan, which never goes near
     * Stripe - Postgres allows any number of nulls under a unique index, so the constraint still holds for
     * the paid ones. Also the key {@code PlanSeeder} upserts on, so re-seeding can't duplicate a plan.
     */
    @Column(unique = true)
    String stripePriceId;

    Integer maxProjects;
    Integer maxTokensPerDay;
    Integer maxPreviews;

    /**
     * Kept on the entity and the API, but <b>enforced nowhere</b>: {@code maxTokensPerDay} is the real limit
     * on every plan, so nothing claims unlimited AI in the UI. It stays so a plan can be flipped to genuinely
     * uncapped later without a migration.
     */
    Boolean unlimitedAi;

    Boolean active;

    /**
     * What the plan costs, in the currency's smallest unit, exactly as Stripe quotes it - 49900 for ₹499.
     * Stored rather than read back from Stripe on every request: a pricing page shouldn't fail because
     * Stripe is slow, and {@code PlanSeeder} is where the two are kept in step.
     */
    Integer priceAmountMinor;

    /** ISO currency code, lowercase, matching Stripe's own ("inr", "usd"). */
    String currency;

    /** Stripe's billing interval for the price above - "month" or "year". */
    String billingInterval;

    /** One line under the plan name on the pricing card. */
    String tagline;

    /** Cheapest first. Explicit, because plan ids are insertion order and say nothing about price. */
    Integer sortOrder;
}
