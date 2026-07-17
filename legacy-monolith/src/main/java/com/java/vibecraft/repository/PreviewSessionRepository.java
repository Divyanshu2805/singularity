package com.java.vibecraft.repository;

import com.java.vibecraft.entity.PreviewSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface PreviewSessionRepository extends JpaRepository<PreviewSession, Long> {

    /** The person's open session on this project, if any. Every query here is per user - there is deliberately no
     * "is this project's preview open" lookup, which is exactly the question that leaked one person's preview to all. */
    Optional<PreviewSession> findFirstByProjectIdAndUserIdAndEndedAtIsNullOrderByIdDesc(Long projectId, Long userId);

    /** Their most recent session on this project, open or ended - what their Preview tab shows. */
    Optional<PreviewSession> findFirstByProjectIdAndUserIdOrderByIdDesc(Long projectId, Long userId);

    int countByUserIdAndEndedAtIsNull(Long userId);

    int countByPreviewIdAndEndedAtIsNull(Long previewId);

    List<PreviewSession> findByPreviewIdAndEndedAtIsNull(Long previewId);

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

    /** Ends every open session on a runner that has itself ended. */
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
