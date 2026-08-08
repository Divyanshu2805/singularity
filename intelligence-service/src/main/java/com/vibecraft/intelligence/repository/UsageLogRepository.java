package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.UsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Reads and writes the daily token counter.
 *
 * <p>Handles: finding a user's row for a given day, which is the single-row read every quota check makes; claiming a
 * reservation against it and truing one up, both as a single atomic UPDATE rather than a read-modify-write, so
 * concurrent AI calls for the same user can neither race past the same day's limit nor lose one another's increment.
 *
 * <p>Every write here first calls {@code ensureRowExists}, an idempotent insert-if-missing: two concurrent first-
 * calls-of-the-day both attempting it is safe (the unique constraint on user_id+date lets exactly one insert win and
 * the other no-op), and it means the UPDATE that follows always has a row to act on, on both a brand-new day and one
 * already in progress.
 */
@Repository
public interface UsageLogRepository extends JpaRepository<UsageLog, Long> {
    Optional<UsageLog> findByUserIdAndDate(Long userId, LocalDate today);

    java.util.List<UsageLog> findByUserIdAndDateBetween(Long userId, LocalDate from, LocalDate to);

    @Modifying
    @Query(value = "INSERT INTO usage_logs (user_id, date, tokens_used) VALUES (:userId, :date, 0) "
            + "ON CONFLICT (user_id, date) DO NOTHING", nativeQuery = true)
    void ensureRowExists(@Param("userId") Long userId, @Param("date") LocalDate date);

    /**
     * Atomically adds {@code amount} only if doing so would not exceed {@code limit}. Returns the number of rows
     * updated (0 or 1) so the caller can tell a rejected reservation from a successful one without a second read.
     */
    @Modifying
    @Query(value = "UPDATE usage_logs SET tokens_used = tokens_used + :amount "
            + "WHERE user_id = :userId AND date = :date AND tokens_used + :amount <= :limit", nativeQuery = true)
    int tryReserve(@Param("userId") Long userId, @Param("date") LocalDate date,
                   @Param("amount") int amount, @Param("limit") int limit);

    @Modifying
    @Query(value = "UPDATE usage_logs SET tokens_used = tokens_used + :amount "
            + "WHERE user_id = :userId AND date = :date", nativeQuery = true)
    void addTokens(@Param("userId") Long userId, @Param("date") LocalDate date, @Param("amount") int amount);

    /**
     * Adjusts by a delta that may be negative - reconciling a reservation down to what a call actually cost - never
     * letting the counter fall below zero.
     */
    @Modifying
    @Query(value = "UPDATE usage_logs SET tokens_used = GREATEST(0, tokens_used + :delta) "
            + "WHERE user_id = :userId AND date = :date", nativeQuery = true)
    void adjust(@Param("userId") Long userId, @Param("date") LocalDate date, @Param("delta") int delta);
}
