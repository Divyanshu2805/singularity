package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.CodeNote;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * Every method here takes the user as well as the project. A code note is private to whoever asked it, so
 * there is deliberately no "find by project" - that query would hand one member another's notes.
 */
public interface CodeNoteRepository extends JpaRepository<CodeNote, Long> {

    List<CodeNote> findByProjectIdAndUserIdOrderByIdAsc(Long projectId, Long userId);

    Optional<CodeNote> findByIdAndProjectIdAndUserId(Long id, Long projectId, Long userId);

    long deleteByProjectIdAndUserId(Long projectId, Long userId);
}
