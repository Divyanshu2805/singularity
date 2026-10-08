package com.singularity.workspace.repository;

import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PreviewStatus;
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
 * <p>Handles: finding a project's latest preview in a given state, listing previews by state, remembering the
 * hostname a project was last served on so its next preview keeps the same URL, listing the previews a user started,
 * the status transitions, and the bootstrap heartbeat a rolling deployment's startup check reads to tell a still-running
 * bootstrap apart from one truly abandoned (CODE_REVIEW.md PRE-03). Also the line for a runner - counting who is
 * ahead and handing a claimed pod to the row that was waiting for it - and the two marks that say a running preview
 * is being brought up to a newer revision and that it has been.
 *
 * <p>Only a waiter whose heartbeat is fresh counts as ahead in the line. One left behind by an instance that died
 * would otherwise hold everyone behind it until the reaper cleared it.
 *
 * <p>Every transition is a conditional update that applies only from the state it expects and returns how many rows
 * changed, so the caller learns whether it won a race - the bootstrap finishing against someone pressing Stop -
 * instead of overwriting the other side.
 */
@Repository
public interface PreviewRepository extends JpaRepository<Preview, Long> {

    Optional<Preview> findFirstByProjectIdAndStatusInOrderByIdDesc(Long projectId, Collection<PreviewStatus> statuses);

    List<Preview> findByProjectIdAndStatusIn(Long projectId, Collection<PreviewStatus> statuses);

    List<Preview> findByStatusIn(Collection<PreviewStatus> statuses);

    @Query("SELECT p.hostname FROM Preview p WHERE p.project.id = :projectId AND p.hostname IS NOT NULL ORDER BY p.id DESC LIMIT 1")
    Optional<String> findLatestHostname(@Param("projectId") Long projectId);

    @Query("""
            SELECT p FROM Preview p JOIN FETCH p.project
            WHERE p.startedByUserId = :userId AND p.status IN :statuses
            ORDER BY p.id DESC
            """)
    List<Preview> findStartedByWithProject(@Param("userId") Long userId,
                                           @Param("statuses") Collection<PreviewStatus> statuses);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Preview p SET p.detail = :detail WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.CREATING")
    int updatePhase(@Param("id") Long id, @Param("detail") String detail);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.bootstrapOwner = :owner, p.bootstrapHeartbeatAt = :now
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.CREATING
            """)
    int heartbeatBootstrap(@Param("id") Long id, @Param("owner") String owner, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.singularity.workspace.enums.PreviewStatus.RUNNING, p.detail = null,
                   p.readyAt = :now, p.lastAccessedAt = :now, p.syncedRevisionId = :syncedRevisionId, p.syncDetail = null
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.CREATING
            """)
    int markRunning(@Param("id") Long id, @Param("now") Instant now, @Param("syncedRevisionId") Long syncedRevisionId);

    @Query("""
            SELECT COUNT(p) FROM Preview p
            WHERE p.status = com.singularity.workspace.enums.PreviewStatus.CREATING AND p.podName IS NULL
              AND p.id < :id AND p.bootstrapHeartbeatAt > :freshSince
            """)
    int countWaitingAhead(@Param("id") Long id, @Param("freshSince") Instant freshSince);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.podName = :podName, p.detail = :detail, p.lastAccessedAt = :now
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.CREATING AND p.podName IS NULL
            """)
    int assignPod(@Param("id") Long id, @Param("podName") String podName, @Param("detail") String detail,
                  @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Preview p SET p.syncDetail = :detail WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.RUNNING")
    int markSyncing(@Param("id") Long id, @Param("detail") String detail);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.syncedRevisionId = :revisionId, p.syncDetail = null
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.RUNNING
            """)
    int markSynced(@Param("id") Long id, @Param("revisionId") Long revisionId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.singularity.workspace.enums.PreviewStatus.CREATING, p.detail = :detail,
                   p.readyAt = null, p.lastAccessedAt = :now, p.syncDetail = null
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.RUNNING
            """)
    int markRestarting(@Param("id") Long id, @Param("detail") String detail, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.singularity.workspace.enums.PreviewStatus.FAILED, p.detail = :detail,
                   p.failureKind = :kind, p.failureLog = :failureLog, p.terminatedAt = :now
            WHERE p.id = :id AND p.status = com.singularity.workspace.enums.PreviewStatus.CREATING
            """)
    int markFailed(@Param("id") Long id, @Param("kind") PreviewFailureKind kind, @Param("detail") String detail,
                   @Param("failureLog") String failureLog, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE Preview p SET p.status = com.singularity.workspace.enums.PreviewStatus.TERMINATED, p.detail = :detail,
                   p.terminatedAt = :now, p.syncDetail = null
            WHERE p.id = :id AND p.status IN (com.singularity.workspace.enums.PreviewStatus.CREATING,
                                             com.singularity.workspace.enums.PreviewStatus.RUNNING)
            """)
    int markTerminated(@Param("id") Long id, @Param("detail") String detail, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE Preview p SET p.lastAccessedAt = :now WHERE p.id = :id")
    int touch(@Param("id") Long id, @Param("now") Instant now);
}
