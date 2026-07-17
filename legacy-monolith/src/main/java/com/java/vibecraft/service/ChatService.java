package com.java.vibecraft.service;


import com.java.vibecraft.dto.chat.ChatResponse;
import com.java.vibecraft.dto.chat.LastTurnChangesResponse;

import java.util.List;

public interface ChatService {

    List<ChatResponse> getProjectChatHistory(Long projectId);

    LastTurnChangesResponse getLastTurnChanges(Long projectId);
}
