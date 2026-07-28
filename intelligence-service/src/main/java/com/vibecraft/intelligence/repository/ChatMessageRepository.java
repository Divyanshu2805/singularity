package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.entity.ChatSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Reads and writes chat turns.
 *
 * <p>Handles: saving a turn, and fetching a session's whole history with each turn's events already joined, in order
 * - so rendering a chat is one query rather than one per turn.
 */
@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {

    @Query("""
            SELECT DISTINCT m FROM ChatMessage m
            LEFT JOIN FETCH m.events e
            WHERE m.chatSession = :chatSession
            ORDER BY m.createdAt ASC, e.sequenceOrder ASC
            """)
    List<ChatMessage> findByChatSession(ChatSession chatSession);
}

