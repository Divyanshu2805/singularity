package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.ChatEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/**
 * Reads and writes the steps that make up a chat turn.
 *
 * <p>Handles: saving a turn's events, fetching the file edits of a user's most recent assistant turn - the turn whose
 * diffs the editor shows - and, for teaching mode, finding one file edit in the caller's own conversation with the
 * turn it belongs to, listing that turn's checklist steps, and keeping the lesson written about the edit.
 *
 * <p>The file edit is looked up by its id together with the project and the user, never by id alone: an id is only a
 * number, and a lesson is written from the file's text, so finding another member's edit would hand out their
 * conversation.
 */
@Repository
public interface ChatEventRepository extends JpaRepository<ChatEvent, Long> {

    @Query("""
            SELECT e FROM ChatEvent e
            WHERE e.type = com.singularity.intelligence.enums.ChatEventType.FILE_EDIT
            AND e.chatMessage.id = (
                SELECT MAX(m.id) FROM ChatMessage m
                WHERE m.chatSession.id.projectId = :projectId
                AND m.chatSession.id.userId = :userId
                AND m.role = com.singularity.intelligence.enums.MessageRole.ASSISTANT
            )
            ORDER BY e.sequenceOrder ASC
            """)
    List<ChatEvent> findLastTurnFileEdits(@Param("projectId") Long projectId, @Param("userId") Long userId);

    @Query("""
            SELECT e FROM ChatEvent e
            JOIN FETCH e.chatMessage m
            WHERE e.id = :eventId
            AND e.type = com.singularity.intelligence.enums.ChatEventType.FILE_EDIT
            AND m.chatSession.id.projectId = :projectId
            AND m.chatSession.id.userId = :userId
            """)
    Optional<ChatEvent> findOwnFileEdit(@Param("eventId") Long eventId, @Param("projectId") Long projectId,
                                        @Param("userId") Long userId);

    @Query("""
            SELECT e FROM ChatEvent e
            WHERE e.chatMessage.id = :messageId
            AND e.type = com.singularity.intelligence.enums.ChatEventType.TODO
            ORDER BY e.sequenceOrder ASC
            """)
    List<ChatEvent> findSteps(@Param("messageId") Long messageId);

    @Modifying
    @Transactional
    @Query("UPDATE ChatEvent e SET e.lesson = :lesson WHERE e.id = :eventId")
    int saveLesson(@Param("eventId") Long eventId, @Param("lesson") String lesson);
}
