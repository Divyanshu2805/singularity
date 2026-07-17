package com.vibecraft.account.repository;

import com.vibecraft.account.entity.AuthAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AuthAuditEventRepository extends JpaRepository<AuthAuditEvent, Long> {

    List<AuthAuditEvent> findTop8ByUserIdOrderByCreatedAtDesc(Long userId);
}
