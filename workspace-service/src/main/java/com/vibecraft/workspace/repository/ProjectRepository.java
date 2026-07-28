package com.vibecraft.workspace.repository;

import com.vibecraft.workspace.entity.Project;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

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
}
