package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.dto.chat.LastTurnChangesResponse;

import java.util.List;

/**
 * The saved build-chat history.
 *
 * <p>Handles: the caller's whole chat on a project, and the latest turn's changed files with their previous versions
 * so the editor can show that turn's diffs.
 */
public interface ChatService {

    List<ChatResponse> getProjectChatHistory(Long projectId);

    LastTurnChangesResponse getLastTurnChanges(Long projectId);
}
