package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.UsageLog;
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
 * <p>Handles: finding a user's row for a given day, reading just the figure on it, and adding a finished call's
 * tokens to it as a single atomic UPDATE rather than a read-modify-write, so concurrent AI calls for the same user
 * cannot lose one another's increment.
 *
 * <p>The write first calls {@code ensureRowExists}, an idempotent insert-if-missing: two concurrent first-calls-of-
 * the-day both attempting it is safe (the unique constraint on user_id+date lets exactly one insert win and the other
 * no-op), and it means the UPDATE that follows always has a row to act on, on both a brand-new day and one already in
 * progress.
 *
 * <p>The counter holds what was spent and nothing else. It once also held reservations - an amount claimed before a
 * call and corrected after it - through a conditional UPDATE and a signed adjustment; those are gone, because a
 * reservation counted as spending is exactly what made the usage meter jump and fall. What a call in progress is
 * holding now lives in memory ({@code BudgetHolds}).
 *
 * <p>{@code findTokensUsed} reads the number itself, not the row as an entity. The budget arithmetic reads it again
 * straight after charging a call, on a request whose persistence context may still hold the row as it was before
 * the charge; a scalar read cannot be answered from that stale copy.
 */
@Repository
public interface UsageLogRepository extends JpaRepository<UsageLog, Long> {
    Optional<UsageLog> findByUserIdAndDate(Long userId, LocalDate today);

    java.util.List<UsageLog> findByUserIdAndDateBetween(Long userId, LocalDate from, LocalDate to);

    @Query(value = "SELECT tokens_used FROM usage_logs WHERE user_id = :userId AND date = :date", nativeQuery = true)
    Optional<Integer> findTokensUsed(@Param("userId") Long userId, @Param("date") LocalDate date);

    @Modifying
    @Query(value = "INSERT INTO usage_logs (user_id, date, tokens_used) VALUES (:userId, :date, 0) "
            + "ON CONFLICT (user_id, date) DO NOTHING", nativeQuery = true)
    void ensureRowExists(@Param("userId") Long userId, @Param("date") LocalDate date);

    @Modifying
    @Query(value = "UPDATE usage_logs SET tokens_used = tokens_used + :amount "
            + "WHERE user_id = :userId AND date = :date", nativeQuery = true)
    void addTokens(@Param("userId") Long userId, @Param("date") LocalDate date, @Param("amount") int amount);
}
