package com.singularity.workspace.repository;

import com.singularity.workspace.entity.ProjectInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

/**
 * Reads and writes invitations nobody has accepted yet.
 *
 * <p>Handles: a project's open invitations, the ones addressed to one email across every project that still exists,
 * one invitation by project and address, counting a project's open invitations for its cap, and writing one.
 *
 * <p>Writing is a native upsert: inviting an address a second time changes the role on offer instead of failing, and
 * two requests for the same address cannot both insert. Both lookups by address exclude deleted projects, so an
 * invitation to a project that has since been deleted is neither listed nor acceptable. Neither modifying query
 * clears the persistence context - see the pitfall on queued changes being thrown away.
 */
@Repository
public interface ProjectInviteRepository extends JpaRepository<ProjectInvite, Long> {

    @Query("SELECT pi FROM ProjectInvite pi WHERE pi.project.id = :projectId ORDER BY pi.invitedAt")
    List<ProjectInvite> findByProjectId(@Param("projectId") Long projectId);

    @Query("""
            SELECT pi FROM ProjectInvite pi JOIN FETCH pi.project p
            WHERE pi.email = :email AND p.deletedAt IS NULL
            ORDER BY pi.invitedAt DESC
            """)
    List<ProjectInvite> findOpenByEmail(@Param("email") String email);

    @Query("""
            SELECT pi FROM ProjectInvite pi JOIN FETCH pi.project p
            WHERE p.id = :projectId AND pi.email = :email AND p.deletedAt IS NULL
            """)
    Optional<ProjectInvite> findOpenByProjectIdAndEmail(@Param("projectId") Long projectId,
                                                        @Param("email") String email);

    @Query("SELECT pi FROM ProjectInvite pi WHERE pi.id = :id AND pi.project.id = :projectId")
    Optional<ProjectInvite> findByIdAndProjectId(@Param("id") Long id, @Param("projectId") Long projectId);

    @Query("SELECT COUNT(pi) FROM ProjectInvite pi WHERE pi.project.id = :projectId")
    int countByProjectId(@Param("projectId") Long projectId);

    @Modifying
    @Query(value = """
            INSERT INTO project_invites (project_id, email, project_role, invited_by, invited_at)
            VALUES (:projectId, :email, :role, :invitedBy, :invitedAt)
            ON CONFLICT (project_id, email)
            DO UPDATE SET project_role = EXCLUDED.project_role, invited_by = EXCLUDED.invited_by,
                          invited_at = EXCLUDED.invited_at
            """, nativeQuery = true)
    void upsert(@Param("projectId") Long projectId, @Param("email") String email, @Param("role") String role,
                @Param("invitedBy") Long invitedBy, @Param("invitedAt") Instant invitedAt);

    @Modifying
    @Query("DELETE FROM ProjectInvite pi WHERE pi.project.id = :projectId AND pi.email = :email")
    int deleteByProjectIdAndEmail(@Param("projectId") Long projectId, @Param("email") String email);
}
