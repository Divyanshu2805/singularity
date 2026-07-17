package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.auth.AuthAuditEventResponse;
import com.java.vibecraft.entity.AuthAuditEvent;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface AuthAuditEventMapper {

    AuthAuditEventResponse toResponse(AuthAuditEvent event);

    List<AuthAuditEventResponse> toResponses(List<AuthAuditEvent> events);
}
