package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.Preview;
import com.vibecraft.workspace.enums.PreviewStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * Reads and writes preview runners.
 *
 * <p>Handles: finding a project's latest preview in any or a given state, listing previews by state, remembering the
 * hostname a project was last served on so its next preview keeps the same URL, counting a user's previews, and the
 * status transitions.
 *
 * <p>Every transition is a conditional update that applies only from the state it expects and returns how many rows
 * changed, so the caller learns whether it won a race - the bootstrap finishing against someone pressing Stop -
 * instead of overwriting the other side.
 */
@Repository
public interface PreviewRepository extends JpaRepository<Preview, Long> {

    Optional<Preview> findFirstByProjectIdOrderByIdDesc(Long projectId);

    Optional<Preview> findFirstByProjectIdAndStatusInOrderByIdDesc(Long projectId, Collection<PreviewStatus> statuses);

    List<Preview> findByProjectIdAndStatusIn(Long projectId, Collection<PreviewStatus> statuses);

    List<Preview> findByStatusIn(Collection<PreviewStatus> statuses);

    @Query("SELECT p.hostname FROM Preview p WHERE p.project.id = :projectId AND p.hostname IS NOT NULL ORDER BY p.id DESC LIMIT 1")
    Optional<String> findLatestHostname(@Param("projectId") Long projectId);

    int countByStartedByUserIdAndStatusIn(Long userId, Collection<PreviewStatus> statuses);

    @Query("""
            SELECT p FROM Preview p JOIN FETCH p.project
            WHERE p.startedByUserId = :userId AND p.status IN :statuses
            ORDER BY p.id DESC
            """)
    List<Preview> findStartedByWithProject(@Param("userId") Long userId,
                                           @Param("statuses") Collection<PreviewStatus> statuses);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Preview p SET p.detail = :detail WHERE p.id = :id AND p.status = com.vibecraft.workspace.enums.PreviewStatus.CREATING")
    int updatePhase(@Param("id") Long id, @Param("detail") String detail);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.vibecraft.workspace.enums.PreviewStatus.RUNNING, p.detail = null,
                   p.readyAt = :now, p.lastAccessedAt = :now
            WHERE p.id = :id AND p.status = com.vibecraft.workspace.enums.PreviewStatus.CREATING
            """)
    int markRunning(@Param("id") Long id, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.vibecraft.workspace.enums.PreviewStatus.CREATING, p.detail = :detail,
                   p.readyAt = null, p.lastAccessedAt = :now
            WHERE p.id = :id AND p.status = com.vibecraft.workspace.enums.PreviewStatus.RUNNING
            """)
    int markRestarting(@Param("id") Long id, @Param("detail") String detail, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.vibecraft.workspace.enums.PreviewStatus.FAILED, p.detail = :detail,
                   p.failureLog = :failureLog, p.terminatedAt = :now
            WHERE p.id = :id AND p.status = com.vibecraft.workspace.enums.PreviewStatus.CREATING
            """)
    int markFailed(@Param("id") Long id, @Param("detail") String detail, @Param("failureLog") String failureLog,
                   @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.vibecraft.workspace.enums.PreviewStatus.TERMINATED, p.detail = :detail,
                   p.terminatedAt = :now
            WHERE p.id = :id AND p.status IN (com.vibecraft.workspace.enums.PreviewStatus.CREATING,
                                             com.vibecraft.workspace.enums.PreviewStatus.RUNNING)
            """)
    int markTerminated(@Param("id") Long id, @Param("detail") String detail, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Preview p SET p.lastAccessedAt = :now WHERE p.id = :id")
    int touch(@Param("id") Long id, @Param("now") Instant now);
}
