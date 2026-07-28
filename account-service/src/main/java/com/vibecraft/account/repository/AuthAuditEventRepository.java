package com.vibecraft.account.repository;

import com.vibecraft.account.entity.AuthAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Reads and writes the account security trail.
 *
 * <p>Handles: appending events, and fetching the most recent few for one user - enough to spot something unfamiliar
 * without turning the page into a log viewer.
 */
@Repository
public interface AuthAuditEventRepository extends JpaRepository<AuthAuditEvent, Long> {

    List<AuthAuditEvent> findTop8ByUserIdOrderByCreatedAtDesc(Long userId);
}
