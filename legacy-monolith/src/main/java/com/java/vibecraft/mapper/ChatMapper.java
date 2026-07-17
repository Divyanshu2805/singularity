package com.java.vibecraft.mapper;

import com.java.vibecraft.dto.chat.ChatResponse;
import com.java.vibecraft.entity.ChatMessage;
import org.mapstruct.Mapper;

import java.util.List;

@Mapper(componentModel = "spring")
public interface ChatMapper {

    List<ChatResponse> fromListOfChatMessage(List<ChatMessage> chatMessageList);
}
