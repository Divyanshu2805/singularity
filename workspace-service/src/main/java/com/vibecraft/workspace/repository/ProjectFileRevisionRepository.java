package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.ProjectFileRevision;
import org.springframework.data.jpa.repository.JpaRepository;
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
 */
@Repository
public interface ProjectFileRevisionRepository extends JpaRepository<ProjectFileRevision, Long> {

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

    interface SnapshotRow {
        String getPath();
        String getContentHash();
        String getChangeType();
    }
}
