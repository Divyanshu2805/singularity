package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.UsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Reads and writes the daily token counter.
 *
 * <p>Handles: finding a user's row for a given day, which is the single-row read every quota check makes and the row
 * every AI call increments.
 */
@Repository
public interface UsageLogRepository extends JpaRepository<UsageLog, Long> {
    Optional<UsageLog> findByUserIdAndDate(Long userId, LocalDate today);

    java.util.List<UsageLog> findByUserIdAndDateBetween(Long userId, LocalDate from, LocalDate to);
}
