package com.vibecraft.account.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

/**
 * One row of the plan catalogue: what a tier costs and what it allows.
 *
 * <p>Handles: the limits every quota check reads (projects, daily tokens, concurrent previews, and the unlimited-AI
 * flag), the Stripe price this plan checks out against, and the pricing-page presentation - amount in minor units,
 * currency, billing interval, tagline and sort order.
 *
 * <p>The price is stored rather than read back from Stripe per request, so a pricing page does not fail because
 * Stripe is slow; PlanSeeder is where the two are kept in step. stripePriceId is null on the free plan, which never
 * goes near Stripe - Postgres allows any number of nulls under a unique index, so the constraint still holds for the
 * paid ones - and it is also the key the seeder upserts on. Sort order is explicit because plan ids are insertion
 * order and say nothing about price.
 */
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

    @Column(unique = true)
    String stripePriceId;

    Integer maxProjects;
    Integer maxTokensPerDay;
    Integer maxPreviews;

    Boolean unlimitedAi;

    Boolean active;

    Integer priceAmountMinor;

    String currency;

    String billingInterval;

    String tagline;

    Integer sortOrder;
}
