package com.vibecraft.intelligence.entity;

import jakarta.persistence.*;
import lombok.*;
import lombok.experimental.FieldDefaults;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "usage_logs", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "date"})
})
/**
 * One user's total tokens for one day - the counter every quota check reads.
 *
 * <p>Handles: the user, the day and the running total, with one row per user per day enforced by a unique constraint.
 *
 * <p>Deliberately a single integer: the budget check happens on every AI request and must be one row. The breakdown
 * lives in the usage-event ledger instead.
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@FieldDefaults(level = AccessLevel.PRIVATE)
public class UsageLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    Long id;

    @Column(name = "user_id", nullable = false)
    Long userId;

    @Column(nullable = false)
    LocalDate date;

    Integer tokensUsed;
}
