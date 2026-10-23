package com.singularity.workspace.repository;

import com.singularity.workspace.entity.PreviewSession;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Reads and writes the per-person sessions on a preview runner.
 *
 * <p>Handles: a person's open or latest session on a project, counting their open sessions and a runner's, listing
 * sessions that have gone idle, and the conditional updates that end one session, end every session on a runner, or
 * record a visit.
 *
 * <p>Every lookup here is per user on purpose. There is deliberately no "is this project's preview open" query - that
 * is exactly the question that once leaked one person's preview to every collaborator.
 *
 * <p>The lookups a request makes fetch the session's runner with it. This service does not keep a request's database
 * session open after its transaction (spring.jpa.open-in-view is off), so a runner left as a lazy reference could not
 * be read once the lookup had returned.
 */
@Repository
public interface PreviewSessionRepository extends JpaRepository<PreviewSession, Long> {

    @EntityGraph(attributePaths = "preview")
    Optional<PreviewSession> findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(Long projectId, Long userId);

    @EntityGraph(attributePaths = "preview")
    Optional<PreviewSession> findFirstByProjectIdAndUserIdOrderByIdDesc(Long projectId, Long userId);

    @EntityGraph(attributePaths = "preview")
    Optional<PreviewSession> findWithPreviewById(Long id);

    int countByUserIdAndEndedAtIsNull(Long userId);

    int countByPreviewIdAndEndedAtIsNull(Long previewId);

    List<PreviewSession> findByEndedAtIsNullAndLastSeenAtBefore(Instant cutoff);

    @Query("""
            SELECT s FROM PreviewSession s JOIN FETCH s.preview p JOIN FETCH p.project
            WHERE s.userId = :userId AND s.endedAt IS NULL
            ORDER BY s.id DESC
            """)
    List<PreviewSession> findOpenByUserWithPreview(@Param("userId") Long userId);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PreviewSession s SET s.endedAt = :now, s.endReason = :reason, s.failed = false
            WHERE s.id = :id AND s.endedAt IS NULL
            """)
    int end(@Param("id") Long id, @Param("reason") String reason, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("""
            UPDATE PreviewSession s SET s.endedAt = :now, s.endReason = :reason, s.failed = :failed
            WHERE s.preview.id = :previewId AND s.endedAt IS NULL
            """)
    int endAllForPreview(@Param("previewId") Long previewId, @Param("reason") String reason,
                         @Param("failed") boolean failed, @Param("now") Instant now);

    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("UPDATE PreviewSession s SET s.lastSeenAt = :now WHERE s.id = :id AND s.endedAt IS NULL")
    int touch(@Param("id") Long id, @Param("now") Instant now);
}
