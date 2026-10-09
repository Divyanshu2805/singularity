package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.GlossaryEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes glossary entries.
 *
 * <p>Handles: a person's glossary for a project, one of their terms by key or by id, how many they hold, keeping a
 * new term's definition, and removing one.
 *
 * <p>Every method takes the user as well as the project: a glossary is the reader's own and there is deliberately no
 * find-by-project query. Keeping is a native insert that does nothing when the term is already there, so the
 * definition a person has read is never replaced by a second writing of it, and two presses of one term at the same
 * moment leave one row.
 */
public interface GlossaryEntryRepository extends JpaRepository<GlossaryEntry, Long> {

    List<GlossaryEntry> findByProjectIdAndUserIdOrderByTermKeyAsc(Long projectId, Long userId);

    Optional<GlossaryEntry> findByProjectIdAndUserIdAndTermKey(Long projectId, Long userId, String termKey);

    Optional<GlossaryEntry> findByIdAndProjectIdAndUserId(Long id, Long projectId, Long userId);

    long countByProjectIdAndUserId(Long projectId, Long userId);

    @Modifying
    @Transactional
    @Query(value = """
            INSERT INTO glossary_entries (project_id, user_id, term, term_key, definition, created_at)
            VALUES (:projectId, :userId, :term, :termKey, :definition, now())
            ON CONFLICT (project_id, user_id, term_key) DO NOTHING
            """, nativeQuery = true)
    int keep(@Param("projectId") Long projectId, @Param("userId") Long userId, @Param("term") String term,
             @Param("termKey") String termKey, @Param("definition") String definition);
}
