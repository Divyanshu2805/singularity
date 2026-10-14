package com.singularity.intelligence.service.impl;

import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.chat.MessageTitlesResponse.MessageTitle;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.MessageTitlePrompts;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.service.MessageTitleService;
import com.singularity.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Writes the titles the chat's scroll rail lists a person's messages by.
 *
 * <p>Handles: finding the caller's own messages on a project that have no title yet (the most recent MAX_MESSAGES of
 * them), asking a model for a title of at most eight words for each in one call, metering that call as project
 * naming, and storing each title only while its message still has none - so two tabs asking at once cannot overwrite
 * each other - answering with the titles it stored.
 *
 * <p>The browser asks after a turn has finished, for a conversation whose rail is shown, and once per message per
 * session. A message the model gave nothing usable for keeps showing its first line. Every way of not having titles -
 * nothing untitled, no allowance left, a provider that failed - is an empty answer, never an error: the rail falls
 * back to the messages' own words.
 *
 * <p>Only the caller's own conversation is read or written, so anyone who may view the project may ask; the model is
 * given those messages and no file and no tool. The call is a few hundred tokens in and a few dozen out.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MessageTitleServiceImpl implements MessageTitleService {

    static final int MAX_MESSAGES = 20;

    private final AuthUtil authUtil;
    private final ChatMessageRepository chatMessageRepository;
    private final UsageService usageService;
    private final AiUsageRecorder aiUsageRecorder;
    private final ChatClient chatClient;
    private final ModelCalls modelCalls;

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public List<MessageTitle> titleMessages(Long projectId) {
        Long userId = authUtil.getCurrentUserId();
        List<ChatMessage> untitled = chatMessageRepository
                .findUntitledRequests(projectId, userId, PageRequest.of(0, MAX_MESSAGES))
                .stream()
                .filter(message -> message.getContent() != null && !message.getContent().isBlank())
                .toList()
                .reversed();
        if (untitled.isEmpty()) {
            return List.of();
        }

        UsageReservation reservation;
        try {
            reservation = usageService.reserveBudget(UsageFeature.PROJECT_NAMING);
        } catch (QuotaExceededException spent) {
            return List.of();
        }
        List<String> titles;
        try {
            ChatResponse response = modelCalls.apply(chatClient.prompt(), AiCallKind.INTERVIEW)
                    .system(MessageTitlePrompts.systemPrompt())
                    .user(MessageTitlePrompts.block(untitled.stream().map(ChatMessage::getContent).toList()))
                    .call()
                    .chatResponse();
            aiUsageRecorder.reconcile(reservation, response, UsageFeature.PROJECT_NAMING, projectId);
            titles = MessageTitlePrompts.parse(response == null || response.getResult() == null ? null
                    : response.getResult().getOutput().getText(), untitled.size());
        } catch (RuntimeException e) {
            aiUsageRecorder.release(reservation);
            log.warn("Couldn't write message titles for projectId: {}", projectId, e);
            return List.of();
        }

        List<MessageTitle> stored = new ArrayList<>();
        for (int i = 0; i < untitled.size(); i++) {
            String title = titles.get(i);
            Long messageId = untitled.get(i).getId();
            if (title != null && chatMessageRepository.setTitleIfUntitled(messageId, title) > 0) {
                stored.add(new MessageTitle(messageId, title));
            }
        }
        return stored;
    }
}
