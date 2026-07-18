package com.vibecraft.intelligence.mapper;

import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.entity.ChatMessage;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface ChatMapper {

    List<ChatResponse> fromListOfChatMessage(List<ChatMessage> chatMessageList);
}
