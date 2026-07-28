package com.vibecraft.intelligence.entity;

import com.vibecraft.intelligence.enums.UsageFeature;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

@Entity
@Table(name = "usage_events", indexes = {
        @Index(name = "idx_usage_events_user_created", columnList = "user_id, created_at")
})
/**
 * One AI call's token usage - the ledger behind usage insights.
 *
 * <p>Handles: who made the call, which project it was for (null for calls made before a project exists), what it was
 * for, the token split and when it happened.
 *
 * <p>Why this exists next to the daily counter: that counter is one integer per user per day, which is exactly what
 * quota enforcement wants - a single-row read on every AI request - but it cannot say which project or feature the
 * tokens went to. Both are written together in one transaction; the counter stays the source of truth for limits,
 * this for insight.
 *
 * <p>The feature is stored as a plain string on purpose. Hibernate generates a check constraint for an enum column
 * and never revisits it, so adding a feature later would make every insert of it fail; neither an explicit column
 * definition nor an attribute converter avoids that here, and a string field is the only mapping that does. The
 * timestamp is set explicitly by the writer rather than generated, so a row can carry the time the call actually
 * happened.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UsageEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(name = "project_id")
    Long projectId;

    @Column(nullable = false, length = 32)
    String feature;

    public UsageFeature feature() {
        return UsageFeature.valueOf(feature);
    }

    @Column(nullable = false)
    Integer inputTokens;

    @Column(nullable = false)
    Integer outputTokens;

    @Column(nullable = false)
    Integer totalTokens;

    @Column(name = "created_at", nullable = false, updatable = false)
    Instant createdAt;
}
