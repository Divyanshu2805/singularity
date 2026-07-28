package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.entity.AuthAuditEvent;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Turns audit rows into the shape the security-settings page reads.
 *
 * <p>Handles: one event or a list of them. Field names match, so MapStruct needs no explicit mapping here.
 */
@Mapper(componentModel = "spring")
public interface AuthAuditEventMapper {

    AuthAuditEventResponse toResponse(AuthAuditEvent event);

    List<AuthAuditEventResponse> toResponses(List<AuthAuditEvent> events);
}
