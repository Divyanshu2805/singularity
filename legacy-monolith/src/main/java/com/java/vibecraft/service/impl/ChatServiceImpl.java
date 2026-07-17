package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.ChatResponse;
import com.java.vibecraft.dto.chat.LastTurnChangesResponse;
import com.java.vibecraft.entity.ChatSessionId;
import com.java.vibecraft.mapper.ChatMapper;
import com.java.vibecraft.repository.ChatEventRepository;
import com.java.vibecraft.repository.ChatMessageRepository;
import com.java.vibecraft.repository.ChatSessionRepository;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.ChatService;
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
