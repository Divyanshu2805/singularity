package com.singularity.account.repository;

import com.singularity.account.entity.AuthAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Reads and writes the account security trail.
 *
 * <p>Handles: appending events, and fetching the most recent few for one user - enough to spot something unfamiliar
 * without turning the page into a log viewer; and deleting the whole trail of an account that is being deleted, by its
 * id and by its Firebase uid, since a rejected sign-in is recorded with the uid alone.
 */
@Repository
public interface AuthAuditEventRepository extends JpaRepository<AuthAuditEvent, Long> {

    List<AuthAuditEvent> findTop8ByUserIdOrderByCreatedAtDesc(Long userId);

    @Modifying
    @Transactional
    @Query("DELETE FROM AuthAuditEvent e WHERE e.userId = :userId OR e.firebaseUid = :firebaseUid")
    int deleteOfAccount(@Param("userId") Long userId, @Param("firebaseUid") String firebaseUid);
}
