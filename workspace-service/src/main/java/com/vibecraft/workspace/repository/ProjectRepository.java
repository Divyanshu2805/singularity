package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes projects.
 *
 * <p>Handles: the caller's accessible projects most-recently-updated first, and one accessible project by id.
 *
 * <p>Both queries fold the membership check and the soft-delete check into the lookup itself, so a project the caller
 * cannot see is indistinguishable from one that does not exist.
 */
@Repository
public interface ProjectRepository extends JpaRepository<Project, Long> {

    @Query("""
            SELECT p FROM Project p
            WHERE p.deletedAt IS NULL
            AND EXISTS (
                        SELECT 1 FROM ProjectMember pm
                        WHERE pm.id.userId = :userId
                        AND pm.id.projectId = p.id
            )
            ORDER BY p.updatedAt DESC
            """
    )
    List<Project> findAllAccessibleByUser(@Param("userId") Long userId);

    @Query("""
            SELECT p FROM Project p
            WHERE p.id = :projectId
            AND p.deletedAt IS NULL
            AND EXISTS (
                         SELECT 1 FROM ProjectMember pm
                         WHERE pm.id.userId = :userId
                         AND pm.id.projectId = :projectId
            )
            """)
    Optional<Project> findAccessibleProjectById(@Param("projectId") Long projectId,
                                                @Param("userId") Long userId);

    /**
     * The atomic "publish" claim (CODE_REVIEW.md AI-05): a single-statement compare-and-swap that only advances a
     * project's current revision if it is still exactly the revision the caller staged this publish against. A
     * rowcount of 0 means a concurrent publish already won - the caller's own already-applied storage changes must
     * then be rolled back and the revision marked CONFLICT, since this statement is the sole source of truth for who
     * won. {@code IS NOT DISTINCT FROM} (rather than {@code =}) is required so a project's very first revision -
     * {@code expectedParentRevisionId} null, current value null - matches instead of every row silently failing the
     * comparison the way {@code NULL = NULL} always does in SQL.
     */
    @Modifying
    @Transactional
    @Query(value = """
            UPDATE projects SET current_file_revision_id = :newRevisionId
            WHERE id = :projectId AND current_file_revision_id IS NOT DISTINCT FROM :expectedParentRevisionId
            """, nativeQuery = true)
    int casAdvanceCurrentRevision(@Param("projectId") Long projectId,
                                   @Param("expectedParentRevisionId") Long expectedParentRevisionId,
                                   @Param("newRevisionId") Long newRevisionId);
}
