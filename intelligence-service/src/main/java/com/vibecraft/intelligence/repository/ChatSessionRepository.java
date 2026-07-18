package com.vibecraft.intelligence.repository;

import com.vibecraft.intelligence.entity.ChatSession;
import com.vibecraft.intelligence.entity.ChatSessionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, ChatSessionId> {
}
