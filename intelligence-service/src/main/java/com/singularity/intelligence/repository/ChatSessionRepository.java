package com.singularity.intelligence.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Reads and writes chat sessions.
 *
 * <p>Handles: finding or creating the session for one project and one user, by their composite key; and deleting every row of an account that is being deleted.
 */
@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, ChatSessionId> {

    @Modifying
    @Query(value = "DELETE FROM chat_sessions WHERE user_id = :userId", nativeQuery = true)
    int deleteAllOfUser(@Param("userId") Long userId);
}
