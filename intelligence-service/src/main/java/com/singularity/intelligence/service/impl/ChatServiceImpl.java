package com.singularity.intelligence.service.impl;

import com.singularity.common.error.ConflictException;
import org.springframework.transaction.annotation.Transactional;

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
 * versions were recorded, since there is nothing to diff it against - and clearing the caller's own chat.
 *
 * <p>Clearing deletes the caller's turns and their events in this project, and nothing else: the files, the
 * revisions those turns published and every other member's conversation stay as they are, so a cleared chat can
 * still be undone from the History panel. The session row is kept - its key is the project and the user, and the
 * next message needs it. It is refused while the caller has a response in progress, which would otherwise be saved
 * into the emptied conversation a moment later. Any member may clear their own chat; a viewer has none to clear.
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
    private final GenerationRegistry generationRegistry;

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

    @Override
    @Transactional
    @PreAuthorize("@security.canViewProject(#projectId)")
    public void clearChat(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        if (generationRegistry.find(projectId, userId).isPresent()) {
            throw new ConflictException("A response is still being written. Wait for it to finish, or stop it, "
                    + "then clear the chat.");
        }
        int events = chatEventRepository.deleteOfSession(projectId, userId);
        int messages = chatMessageRepository.deleteOfSession(projectId, userId);
        log.info("User {} cleared their chat in projectId: {} ({} turn(s), {} event(s))", userId, projectId, messages, events);
    }
}
