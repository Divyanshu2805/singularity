package com.vibecraft.account.mapper;

import com.vibecraft.account.dto.auth.AuthAuditEventResponse;
import com.vibecraft.account.entity.AuthAuditEvent;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface AuthAuditEventMapper {

    AuthAuditEventResponse toResponse(AuthAuditEvent event);

    List<AuthAuditEventResponse> toResponses(List<AuthAuditEvent> events);
}
