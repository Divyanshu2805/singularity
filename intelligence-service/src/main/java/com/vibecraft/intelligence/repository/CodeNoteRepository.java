package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.CodeNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes code notes.
 *
 * <p>Handles: a user's notes on a project, one note of theirs by id, and clearing their thread.
 *
 * <p>Every method takes the user as well as the project. A note is private to whoever asked it, so there is
 * deliberately no find-by-project query - that one would hand one member another's notes.
 */
public interface CodeNoteRepository extends JpaRepository<CodeNote, Long> {

    List<CodeNote> findByProjectIdAndUserIdOrderByIdAsc(Long projectId, Long userId);

    Optional<CodeNote> findByIdAndProjectIdAndUserId(Long id, Long projectId, Long userId);

    long deleteByProjectIdAndUserId(Long projectId, Long userId);
}
