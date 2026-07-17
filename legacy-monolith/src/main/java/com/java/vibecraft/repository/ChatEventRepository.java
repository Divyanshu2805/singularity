package com.java.vibecraft.repository;

import com.java.vibecraft.entity.ChatEvent;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatEventRepository extends JpaRepository<ChatEvent, Long> {

    /** The file edits of the user's most recent assistant turn in a project - the turn whose diffs the editor shows. */
    @Query("""
            SELECT e FROM ChatEvent e
            WHERE e.type = com.java.vibecraft.enums.ChatEventType.FILE_EDIT
            AND e.chatMessage.id = (
                SELECT MAX(m.id) FROM ChatMessage m
                WHERE m.chatSession.id.projectId = :projectId
                AND m.chatSession.id.userId = :userId
                AND m.role = com.java.vibecraft.enums.MessageRole.ASSISTANT
            )
            ORDER BY e.sequenceOrder ASC
            """)
    List<ChatEvent> findLastTurnFileEdits(@Param("projectId") Long projectId, @Param("userId") Long userId);

    /**
     * The concepts from a user's latest teaching-mode lessons, newest lesson first - one comma-separated entry per
     * lesson, so deduplicating the names happens in {@code TeachingMode}. Spans all of the user's projects,
     * soft-deleted ones included: what someone has learned doesn't go away with the project.
     */
    @Query("""
            SELECT e.metadata FROM ChatEvent e
            WHERE e.type = 'LEARN' AND e.metadata IS NOT NULL
            AND e.chatMessage.chatSession.id.userId = :userId
            ORDER BY e.id DESC
            """)
    List<String> findRecentLessonConcepts(@Param("userId") Long userId, Pageable pageable);
}
