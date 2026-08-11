package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.ProjectMember;
import com.vibecraft.workspace.entity.ProjectMemberId;
import com.vibecraft.workspace.enums.ProjectRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes project memberships.
 *
 * <p>Handles: listing a project's members or a user's memberships, resolving a user's role on a project - the query
 * behind every permission check - counting the projects a user owns for the plan's project quota, and serializing a
 * user's own concurrent quota checks so two requests can't both be admitted at the last slot.
 *
 * <p>Both queries that answer a question about entitlement exclude soft-deleted projects. Without that, a deleted
 * project's members would still pass every permission check on it.
 */
@Repository
public interface ProjectMemberRepository extends JpaRepository<ProjectMember, ProjectMemberId> {

    List<ProjectMember> findByIdProjectId(Long projectId);

    List<ProjectMember> findByIdUserId(Long userId);

    @Query("""
            SELECT pm.projectRole FROM ProjectMember pm
            WHERE pm.id.projectId = :projectId AND pm.id.userId = :userId
            AND pm.project.deletedAt IS NULL
            """)
    Optional<ProjectRole> findRoleByProjectIdAndUserId(@Param("projectId") Long projectId,
                                                       @Param("userId") Long userId);

    @Query("""
            SELECT COUNT(pm) FROM ProjectMember pm
            WHERE pm.id.userId = :userId AND pm.projectRole = 'OWNER'
            AND pm.project.deletedAt IS NULL
            """)
    int countProjectOwnedByUser(@Param("userId") Long userId);

    /**
     * Blocks until any other transaction holding this same user's project-quota lock has committed or rolled back,
     * and releases automatically at the end of this transaction. CODE_REVIEW.md DATA-02: a plain "count, then check,
     * then insert" lets two concurrent creates (or a create racing a fork) both read "under the limit" before either
     * has committed a new project, admitting one more project than the plan allows. Call this before the count, in
     * the same transaction as the project insert that follows - the transaction, not the connection, is what the
     * lock is scoped to, so it is never left held across a request boundary. The second key namespaces this lock
     * away from any other advisory lock this service might use.
     */
    @Query(value = "SELECT pg_advisory_xact_lock(hashtext('project-quota'), CAST(:userId AS int))", nativeQuery = true)
    Integer lockProjectQuota(@Param("userId") Long userId);
}
