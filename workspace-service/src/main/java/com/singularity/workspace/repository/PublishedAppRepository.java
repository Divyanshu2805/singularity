package com.singularity.workspace.repository;

import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
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
 * Reads and writes published apps.
 *
 * <p>Handles: finding a project's app or one by its link name, the live apps among a set of projects (for the
 * project cards), how many live apps an owner has (the plan allowance), the builds whose heartbeat has stopped, the
 * runner pods builds hold (so the orphan sweep leaves them alone), the old builds waiting to be deleted, and every
 * state change of a build.
 *
 * <p>Every state change is a conditional update that returns how many rows it changed, so the caller learns whether
 * it won: the claim of a build applies only when none is under way and the last one started long enough ago; every
 * later write names the build number it belongs to and applies only while that build is still the one under way.
 * That is what lets Unpublish, a project's deletion and the sweeper end a build from outside without the build
 * writing its result over them afterwards.
 */
@Repository
public interface PublishedAppRepository extends JpaRepository<PublishedApp, Long> {

    Optional<PublishedApp> findByProjectId(Long projectId);

    Optional<PublishedApp> findBySlug(String slug);

    boolean existsBySlug(String slug);

    @Query("SELECT a FROM PublishedApp a WHERE a.projectId IN :projectIds AND a.status = :status")
    List<PublishedApp> findByProjectIdsAndStatus(@Param("projectIds") Collection<Long> projectIds,
                                                 @Param("status") PublishStatus status);

    @Query("""
            SELECT COUNT(a) FROM PublishedApp a
            WHERE a.status = com.singularity.workspace.enums.PublishStatus.LIVE
              AND a.project.deletedAt IS NULL
              AND EXISTS (SELECT 1 FROM ProjectMember pm
                          WHERE pm.id.projectId = a.projectId AND pm.id.userId = :userId
                            AND pm.projectRole = com.singularity.workspace.enums.ProjectRole.OWNER)
            """)
    int countLiveOwnedBy(@Param("userId") Long userId);

    @Query("SELECT a FROM PublishedApp a WHERE a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING AND a.buildHeartbeatAt < :cutoff")
    List<PublishedApp> findBuildsWithoutHeartbeatSince(@Param("cutoff") Instant cutoff);

    @Query("SELECT a.buildPodName FROM PublishedApp a WHERE a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING AND a.buildPodName IS NOT NULL")
    List<String> findBuildPodNames();

    @Query("SELECT a FROM PublishedApp a WHERE a.retiredPrefix IS NOT NULL AND a.retiredAt < :cutoff")
    List<PublishedApp> findRetiredBefore(@Param("cutoff") Instant cutoff);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING,
                   a.buildNumber = a.buildNumber + 1, a.buildRevisionId = null, a.buildDetail = :detail,
                   a.buildPodName = null, a.buildStartedByUserId = :userId, a.buildStartedAt = :now,
                   a.buildHeartbeatAt = :now, a.buildOwner = :owner,
                   a.failureKind = null, a.failureDetail = null, a.failureLog = null
            WHERE a.id = :id
              AND (a.buildStatus IS NULL OR a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.FAILED)
              AND (a.buildStartedAt IS NULL OR a.buildStartedAt < :startedBefore)
            """)
    int claimBuild(@Param("id") Long id, @Param("userId") Long userId, @Param("owner") String owner,
                   @Param("detail") String detail, @Param("now") Instant now,
                   @Param("startedBefore") Instant startedBefore);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildDetail = :detail, a.buildHeartbeatAt = :now
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int updatePhase(@Param("id") Long id, @Param("build") long build, @Param("detail") String detail,
                    @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildHeartbeatAt = :now
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int heartbeat(@Param("id") Long id, @Param("build") long build, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildPodName = :podName, a.buildHeartbeatAt = :now
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int assignPod(@Param("id") Long id, @Param("build") long build, @Param("podName") String podName,
                  @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildRevisionId = :revisionId
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int recordBuildRevision(@Param("id") Long id, @Param("build") long build, @Param("revisionId") Long revisionId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.status = com.singularity.workspace.enums.PublishStatus.LIVE,
                   a.retiredPrefix = CASE WHEN a.retiredPrefix IS NULL THEN a.livePrefix ELSE a.retiredPrefix END,
                   a.retiredAt = CASE WHEN a.retiredPrefix IS NULL THEN :now ELSE a.retiredAt END,
                   a.livePrefix = :prefix, a.liveRevisionId = a.buildRevisionId, a.liveFileCount = :files,
                   a.liveBytes = :bytes, a.publishedByUserId = a.buildStartedByUserId, a.publishedAt = :now,
                   a.buildStatus = null, a.buildDetail = null, a.buildPodName = null,
                   a.failureKind = null, a.failureDetail = null, a.failureLog = null
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int markLive(@Param("id") Long id, @Param("build") long build, @Param("prefix") String prefix,
                 @Param("files") int files, @Param("bytes") long bytes, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.FAILED,
                   a.buildDetail = null, a.buildPodName = null, a.failureKind = :kind,
                   a.failureDetail = :detail, a.failureLog = :failureLog
            WHERE a.id = :id AND a.buildNumber = :build
              AND a.buildStatus = com.singularity.workspace.enums.PublishBuildStatus.BUILDING
            """)
    int markFailed(@Param("id") Long id, @Param("build") long build, @Param("kind") PublishFailureKind kind,
                   @Param("detail") String detail, @Param("failureLog") String failureLog);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PublishedApp a SET a.status = com.singularity.workspace.enums.PublishStatus.UNPUBLISHED,
                   a.retiredPrefix = CASE WHEN a.retiredPrefix IS NULL THEN a.livePrefix ELSE a.retiredPrefix END,
                   a.retiredAt = CASE WHEN a.retiredPrefix IS NULL THEN :now ELSE a.retiredAt END,
                   a.livePrefix = null, a.liveRevisionId = null, a.liveFileCount = null, a.liveBytes = null,
                   a.publishedAt = null, a.buildStatus = null, a.buildDetail = null, a.buildPodName = null,
                   a.failureKind = null, a.failureDetail = null, a.failureLog = null
            WHERE a.id = :id
            """)
    int markUnpublished(@Param("id") Long id, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE PublishedApp a SET a.retiredPrefix = null, a.retiredAt = null WHERE a.id = :id AND a.retiredPrefix = :prefix")
    int clearRetired(@Param("id") Long id, @Param("prefix") String prefix);
}
