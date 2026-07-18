package com.vibecraft.intelligence.entity;

import com.vibecraft.intelligence.enums.UsageFeature;
import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;

import java.time.Instant;

/**
 * One AI call's token usage - the ledger behind usage insights.
 *
 * <p><b>Why a second table next to {@link UsageLog}.</b> {@code UsageLog} is one integer per user per day, and
 * that is exactly what quota enforcement wants: a single-row read on every AI request. It can't say which
 * project or feature the tokens went to, or how they split between input and output, so it can't feed a
 * breakdown. Both are written together in one transaction by {@code UsageServiceImpl.recordTokenUsage}; the
 * daily counter stays the source of truth for limits, and this is the source of truth for insight.
 *
 * <p>{@code userId}/{@code projectId} are plain columns rather than associations, like {@code UsageLog}: the
 * ledger is append-only and only ever aggregated, and a soft-deleted project's tokens were still spent.
 */
@Entity
@Table(name = "usage_events", indexes = {
        @Index(name = "idx_usage_events_user_created", columnList = "user_id, created_at")
})
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

    /** Null for calls made before a project exists - the idea interview and naming. */
    @Column(name = "project_id")
    Long projectId;

    /**
     * A {@link UsageFeature} name, stored as a <b>plain String</b> on purpose. Hibernate generates
     * {@code CHECK (feature IN (...))} for an enum column and {@code ddl-auto: update} never revisits it, so adding a
     * feature later would make every insert of it fail. Verified 2026-09-16 that neither known workaround prevents
     * this on this Hibernate version - an explicit {@code columnDefinition} (the {@code ChatEvent.type} trick in
     * CLAUDE.md) and an {@code AttributeConverter} both still produced {@code usage_events_feature_check}. A String
     * field is the only mapping that doesn't. Use {@link #feature()} to read it as the enum.
     */
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

    /**
     * When the call happened, always set by the writer. Deliberately <b>not</b> {@code @CreationTimestamp}, the
     * usual convention here: in Hibernate 6 that overwrites any value on insert, and the backfill has to keep each
     * historical chat message's real time or every past build would land on the day the backfill ran.
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    Instant createdAt;
}
