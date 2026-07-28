package com.vibecraft.intelligence.mapper;

import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.entity.ChatMessage;
import org.mapstruct.Mapper;

import java.util.List;

/**
 * Turns saved chat turns into the shape the chat panel reads.
 *
 * <p>Handles: a list of messages with their events. Field names match, so MapStruct needs no explicit mapping.
 */
@Mapper(componentModel = "spring")
public interface ChatMapper {

    List<ChatResponse> fromListOfChatMessage(List<ChatMessage> chatMessageList);
}
