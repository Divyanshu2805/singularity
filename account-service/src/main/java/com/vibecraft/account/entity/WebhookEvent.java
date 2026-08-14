package com.vibecraft.account.entity;

import com.vibecraft.account.enums.WebhookEventStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * A durable record of one Stripe webhook delivery, keyed on Stripe's own event id.
 *
 * <p>Handles: nothing beyond bookkeeping - WebhookEventRepository.tryClaim does the actual claim-or-skip decision
 * as a single atomic upsert, since a plain JPA save() would merge rather than insert for this entity's
 * manually-assigned id and so could never detect a duplicate delivery by itself.
 */
@Getter
@Setter
@FieldDefaults(level = AccessLevel.PRIVATE)
@Entity
@Table(name = "webhook_events")
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class WebhookEvent {

    @Id
    String id;

    @Column(nullable = false)
    String type;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    WebhookEventStatus status;

    Instant createdAt;

    @UpdateTimestamp
    Instant updatedAt;
}
