package com.java.vibecraft.repository;

import com.java.vibecraft.entity.ChatSession;
import com.java.vibecraft.entity.ChatSessionId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ChatSessionRepository extends JpaRepository<ChatSession, ChatSessionId> {
}
