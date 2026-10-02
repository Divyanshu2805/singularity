package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.dto.chat.ChatResponse;
import com.singularity.intelligence.dto.chat.LastTurnChangesResponse;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.mapper.ChatMapper;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * The saved build-chat history.
 *
 * <p>Handles: reading the caller's own chat on a project - a session that does not exist yet is an empty list, not an
 * error - and the latest turn's changed files with their previous versions, skipping any edit saved before those
 * versions were recorded, since there is nothing to diff it against.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatServiceImpl implements ChatService {

    private final ChatMessageRepository chatMessageRepository;
    private final ChatEventRepository chatEventRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final AuthUtil authUtil;
    private final ChatMapper chatMapper;

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public List<ChatResponse> getProjectChatHistory(Long projectId) {
        Long userId = authUtil.getCurrentUserId();

        return chatSessionRepository.findById(new ChatSessionId(projectId, userId))
                .map(chatMessageRepository::findByChatSession)
                .map(chatMapper::fromListOfChatMessage)
                .orElseGet(() -> {
                    log.info("No chat session yet for projectId: {}, userId: {}", projectId, userId);
                    return List.of();
                });
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public LastTurnChangesResponse getLastTurnChanges(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        List<LastTurnChangesResponse.FileChange> files = chatEventRepository.findLastTurnFileEdits(projectId, userId).stream()
                .filter(event -> event.getFilePath() != null && event.getPreviousContent() != null)
                .map(event -> new LastTurnChangesResponse.FileChange(event.getFilePath(), event.getPreviousContent()))
                .toList();
        return new LastTurnChangesResponse(files);
    }
}
