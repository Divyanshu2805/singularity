package com.vibecraft.intelligence.service.impl;

import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.dto.chat.LastTurnChangesResponse;
import com.vibecraft.intelligence.entity.ChatSessionId;
import com.vibecraft.intelligence.mapper.ChatMapper;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.intelligence.security.AuthUtil;
import com.vibecraft.intelligence.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;

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
                // A turn saved before previous versions were recorded has nothing to diff against.
                .filter(event -> event.getFilePath() != null && event.getPreviousContent() != null)
                .map(event -> new LastTurnChangesResponse.FileChange(event.getFilePath(), event.getPreviousContent()))
                .toList();
        return new LastTurnChangesResponse(files);
    }
}
