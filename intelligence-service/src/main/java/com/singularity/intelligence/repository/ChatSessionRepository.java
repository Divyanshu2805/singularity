package com.singularity.intelligence.repository;

import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes chat sessions.
 *
 * <p>Handles: finding or creating the session for one project and one user, by their composite key.
 */
@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, ChatSessionId> {
}
