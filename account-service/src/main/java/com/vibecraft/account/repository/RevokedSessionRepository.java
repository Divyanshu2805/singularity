package com.vibecraft.account.repository;

import com.vibecraft.account.entity.RevokedSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Reads and writes the revoked-session list.
 *
 * <p>Handles: recording a signed-out cookie hash, answering whether one is revoked, and pruning rows whose cookie
 * would have expired anyway.
 */
@Repository
public interface RevokedSessionRepository extends JpaRepository<RevokedSession, String> {

    @Modifying
    @Transactional
    @Query("DELETE FROM RevokedSession r WHERE r.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
