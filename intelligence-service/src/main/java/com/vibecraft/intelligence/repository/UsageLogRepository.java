package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.UsageLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;

@Repository
public interface UsageLogRepository extends JpaRepository<UsageLog, Long> {
    Optional<UsageLog> findByUserIdAndDate(Long userId, LocalDate today);

    /** The quota counter for a window of days - what insights reconcile the ledger against. */
    java.util.List<UsageLog> findByUserIdAndDateBetween(Long userId, LocalDate from, LocalDate to);
}
