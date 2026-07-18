package com.vibecraft.intelligence.service;


import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.dto.chat.LastTurnChangesResponse;

import java.util.List;

public interface ChatService {

    List<ChatResponse> getProjectChatHistory(Long projectId);

    LastTurnChangesResponse getLastTurnChanges(Long projectId);
}
