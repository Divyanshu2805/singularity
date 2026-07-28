package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.ChatEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Reads and writes the steps that make up a chat turn.
 *
 * <p>Handles: saving a turn's events, fetching the file edits of a user's most recent assistant turn - the turn whose
 * diffs the editor shows - and reading back the concepts from their latest teaching-mode lessons.
 *
 * <p>The lesson query spans all of the user's projects, soft-deleted ones included: what someone has learned does not
 * go away with the project.
 */
@Repository
public interface ChatEventRepository extends JpaRepository<ChatEvent, Long> {

    @Query("""
            SELECT e FROM ChatEvent e
            WHERE e.type = com.vibecraft.intelligence.enums.ChatEventType.FILE_EDIT
            AND e.chatMessage.id = (
                SELECT MAX(m.id) FROM ChatMessage m
                WHERE m.chatSession.id.projectId = :projectId
                AND m.chatSession.id.userId = :userId
                AND m.role = com.vibecraft.intelligence.enums.MessageRole.ASSISTANT
            )
            ORDER BY e.sequenceOrder ASC
            """)
    List<ChatEvent> findLastTurnFileEdits(@Param("projectId") Long projectId, @Param("userId") Long userId);

    @Query("""
            SELECT e.metadata FROM ChatEvent e
            WHERE e.type = 'LEARN' AND e.metadata IS NOT NULL
            AND e.chatMessage.chatSession.id.userId = :userId
            ORDER BY e.id DESC
            """)
    List<String> findRecentLessonConcepts(@Param("userId") Long userId, Pageable pageable);
}
