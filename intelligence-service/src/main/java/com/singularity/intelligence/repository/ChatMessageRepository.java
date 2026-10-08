package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Reads and writes chat turns.
 *
 * <p>Handles: saving a turn, and fetching a session's whole history with each turn's events already joined, in order
 * - so rendering a chat is one query rather than one per turn - and finding the request a reply answered: the
 * user's message saved just before it in the same session, which a lesson on that reply's steps starts from.
 *
 * <p>Turns are ordered by when they were saved and then by id. A user's message and the reply to it are saved a moment
 * apart, and on a clock that ticks coarsely they can share a timestamp; without the id the reply could sort first.
 */
@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Query("""
            SELECT DISTINCT m FROM ChatMessage m
            LEFT JOIN FETCH m.events e
            WHERE m.chatSession = :chatSession
            ORDER BY m.createdAt ASC, m.id ASC, e.sequenceOrder ASC
            """)
    List<ChatMessage> findByChatSession(ChatSession chatSession);

    @Query("""
            SELECT m.content FROM ChatMessage m
            WHERE m.chatSession.id.projectId = :projectId
            AND m.chatSession.id.userId = :userId
            AND m.role = com.singularity.intelligence.enums.MessageRole.USER
            AND m.id < :replyId
            ORDER BY m.id DESC
            """)
    List<String> findRequestsBefore(@Param("projectId") Long projectId, @Param("userId") Long userId,
                                    @Param("replyId") Long replyId, Pageable pageable);
}

