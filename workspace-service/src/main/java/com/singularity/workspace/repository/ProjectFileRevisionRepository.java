package com.singularity.workspace.repository;

import com.singularity.workspace.entity.ProjectFileRevision;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Reads and writes revision manifests.
 *
 * <p>Handles: listing a project's revision history, most recent first, and reconstructing the exact path/content-hash
 * snapshot as of any one revision by walking {@code parent_revision_id} back to the root and keeping only each
 * path's most recent (least-depth) entry - a delta chain, not a materialized full-tree row per revision. Deleted
 * paths are filtered out by the caller, not here, since "was this path ever deleted after this depth" still needs
 * the change_type column.
 *
 * <p>Also handles what each path held before any revision touched it ({@code findOriginalContent}): the previous
 * hash recorded by the first applied revision to change that path, null where that revision created the file. The
 * starter template and a fork's copied files are written with no revision of their own, so this is the only record
 * of what they first contained.
 */
@Repository
public interface ProjectFileRevisionRepository extends JpaRepository<ProjectFileRevision, Long> {

    @Modifying
    @org.springframework.transaction.annotation.Transactional
    @Query("""
            UPDATE ProjectFileRevision r
            SET r.restoredRevisionId = :restoredRevisionId, r.restoredBefore = :before
            WHERE r.id = :revisionId AND r.projectId = :projectId
            """)
    int recordRestoreTarget(@Param("projectId") Long projectId, @Param("revisionId") Long revisionId,
                            @Param("restoredRevisionId") Long restoredRevisionId, @Param("before") boolean before);

    List<ProjectFileRevision> findByProjectIdOrderByIdDesc(Long projectId);

    @Query(value = """
            WITH RECURSIVE chain AS (
                SELECT id, parent_revision_id, 0 AS depth FROM project_file_revisions WHERE id = :revisionId
                UNION ALL
                SELECT r.id, r.parent_revision_id, c.depth + 1
                FROM project_file_revisions r JOIN chain c ON r.id = c.parent_revision_id
            )
            SELECT DISTINCT ON (e.path) e.path AS path, e.content_hash AS contentHash, e.change_type AS changeType
            FROM project_file_revision_entries e JOIN chain c ON e.revision_id = c.id
            ORDER BY e.path, c.depth ASC
            """, nativeQuery = true)
    List<SnapshotRow> reconstructSnapshot(@Param("revisionId") Long revisionId);

    @Query(value = """
            SELECT DISTINCT ON (e.path) e.path AS path, e.previous_content_hash AS contentHash, e.change_type AS changeType
            FROM project_file_revision_entries e JOIN project_file_revisions r ON r.id = e.revision_id
            WHERE r.project_id = :projectId AND r.status = 'APPLIED'
            ORDER BY e.path, r.id ASC
            """, nativeQuery = true)
    List<SnapshotRow> findOriginalContent(@Param("projectId") Long projectId);

    interface SnapshotRow {
        String getPath();
        String getContentHash();
        String getChangeType();
    }
}
