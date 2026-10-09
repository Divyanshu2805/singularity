package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.ProjectTour;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

/**
 * Reads and writes the tours of projects.
 *
 * <p>Handles: one person's tour of one project, and keeping a newly written one in place of the last.
 *
 * <p>Every method takes the user as well as the project: a tour is written for one reader and there is deliberately no
 * find-by-project query. Keeping is a native upsert, because two requests for the same tour at the same moment must
 * leave one row, not fail on the unique key.
 */
public interface ProjectTourRepository extends JpaRepository<ProjectTour, Long> {

    Optional<ProjectTour> findByProjectIdAndUserId(Long projectId, Long userId);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO project_tours (project_id, user_id, content, created_at, updated_at)
            VALUES (:projectId, :userId, :content, now(), now())
            ON CONFLICT (project_id, user_id) DO UPDATE SET content = EXCLUDED.content, updated_at = now()
            """, nativeQuery = true)
    int keep(@Param("projectId") Long projectId, @Param("userId") Long userId, @Param("content") String content);
}
