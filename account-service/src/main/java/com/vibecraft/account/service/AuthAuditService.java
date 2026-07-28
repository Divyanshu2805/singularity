package com.vibecraft.account.service;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.entity.AuthAuditEvent;
import com.vibecraft.account.enums.AuthAuditEventType;
import com.vibecraft.account.mapper.AuthAuditEventMapper;
import com.vibecraft.account.repository.AuthAuditEventRepository;
import com.vibecraft.common.security.ClientInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The account security trail.
 *
 * <p>Handles: recording an event with its client details, truncating an over-long detail, and reading back the most
 * recent few for a user.
 *
 * <p>Recording never fails the request it describes: a sign-in that worked must not turn into an error because the
 * audit insert did not, so a failure is logged at ERROR instead, where it will be seen.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthAuditService {

    private static final int MAX_DETAIL = 255;

    private final AuthAuditEventRepository repository;
    private final AuthAuditEventMapper mapper;

    public void record(AuthAuditEventType type, Long userId, String firebaseUid, ClientInfo client, String detail) {
        try {
            repository.save(AuthAuditEvent.builder()
                    .type(type)
                    .userId(userId)
                    .firebaseUid(firebaseUid)
                    .ipAddress(client == null ? null : client.ipAddress())
                    .userAgent(client == null ? null : client.userAgent())
                    .detail(detail == null || detail.length() <= MAX_DETAIL ? detail : detail.substring(0, MAX_DETAIL))
                    .build());
        } catch (RuntimeException ex) {
            log.error("Couldn't record auth audit event {} for user {}", type, userId, ex);
        }
    }

    public List<AuthAuditEventResponse> recentFor(Long userId) {
        return mapper.toResponses(repository.findTop8ByUserIdOrderByCreatedAtDesc(userId));
    }
}
