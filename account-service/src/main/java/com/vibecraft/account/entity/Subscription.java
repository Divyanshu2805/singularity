package com.vibecraft.account.entity;

import com.vibecraft.account.enums.SubscriptionStatus;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;

/**
 * A user's subscription to a plan, mirroring what Stripe holds.
 *
 * <p>Handles: who is subscribed to what, the status that decides entitlement, the Stripe subscription id the webhooks
 * arrive against, the current billing period, and whether it is set to stop at the end of that period.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "subscriptions")
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false, name = "user_id")
    User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false, name = "plan_id")
    Plan plan;

    @Enumerated(value = EnumType.STRING)
    @Column(nullable = false)
    SubscriptionStatus status;

    String stripeSubscriptionId;

    Instant currentPeriodStart;
    Instant currentPeriodEnd;
    @Builder.Default
    Boolean cancelAtPeriodEnd = false;

    @CreationTimestamp
    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;
}
