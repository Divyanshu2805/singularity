package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.StreamResponse;
import com.java.vibecraft.entity.*;
import com.java.vibecraft.enums.ChatEventType;
import com.java.vibecraft.enums.MessageRole;
import com.java.vibecraft.error.ResourceNotFoundException;
import com.java.vibecraft.llm.LlmResponseParser;
import com.java.vibecraft.llm.PromptUtils;
import com.java.vibecraft.llm.advisors.FileTreeContextAdvisor;
import com.java.vibecraft.llm.tools.CodeGenerationTools;
import com.java.vibecraft.repository.*;
import com.java.vibecraft.security.AuthUtil;
import com.java.vibecraft.service.AiGenerationService;
import com.java.vibecraft.service.ProjectFileService;
import com.java.vibecraft.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.scheduler.Schedulers;
import reactor.util.retry.Retry;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiGenerationServiceImpl implements AiGenerationService {

    private final ChatClient chatClient;
    private final AuthUtil authUtil;
    private final ProjectFileService projectFileService;
    private final FileTreeContextAdvisor fileTreeContextAdvisor;
    private final ChatSessionRepository chatSessionRepository;
    private final ProjectRepository projectRepository;
    private final LlmResponseParser llmResponseParser;
    private final UserRepository userRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ChatEventRepository chatEventRepository;
    private final UsageService usageService;

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Flux<StreamResponse> streamResponse(String userMessage, Long projectId) {

//        usageService.checkDailyTokensUsage();

        Long userId = authUtil.getCurrentUserId();
        ChatSession chatSession = createChatSessionIfNotExists(projectId, userId);

        Map<String, Object> advisorParams = Map.of(
                "userId", userId,
                "projectId", projectId
        );

        StringBuilder fullResponseBuffer = new StringBuilder();
        CodeGenerationTools codeGenerationTools = new CodeGenerationTools(projectFileService, projectId);

        AtomicReference<Long> startTime = new AtomicReference<>(System.currentTimeMillis());
        AtomicReference<Long> endTime = new AtomicReference<>(0L);
        AtomicReference<Usage> usageRef = new AtomicReference<>();

        return Flux.defer(() -> chatClient.prompt()
                        .system(PromptUtils.getSystemPrompt())
                        .user(userMessage)
                        .tools(codeGenerationTools)
                        .advisors(advisorSpec -> {
                                    advisorSpec.params(advisorParams);
                                    advisorSpec.advisors(fileTreeContextAdvisor);
                                }
                        )
                        .stream()
                        .chatResponse())
                .retryWhen(Retry.backoff(3, Duration.ofSeconds(3))
                        .filter(throwable -> throwable instanceof WebClientResponseException.TooManyRequests)
                        .doBeforeRetry(signal -> log.warn("Rate limited by OpenRouter, retrying (attempt {})", signal.totalRetries() + 1)))
                .doOnNext(response -> {
                    if(response.getMetadata().getUsage() != null) {
                        usageRef.set(response.getMetadata().getUsage());
                    }

                    // The trailing chunk that carries usage stats (stream-usage: true) has no
                    // choices at all, so getResult() is null here - nothing else to do with it.
                    if(response.getResult() == null) {
                        return;
                    }

                    String content = response.getResult().getOutput().getText();

                    if(content != null && !content.isEmpty() && endTime.get() == 0) { // first non-empty chunk received
                        endTime.set(System.currentTimeMillis());
                    }

                    fullResponseBuffer.append(content);
                })
                .doOnComplete(() -> {
                    Schedulers.boundedElastic().schedule(() -> {
                        long duration = (endTime.get() - startTime.get()) /  1000;
                        try {
                            finalizeChats(userMessage, chatSession, fullResponseBuffer.toString(), duration, usageRef.get());
                        } catch (Exception e) {
                            log.error("Failed to finalize chat for projectId: {}. Raw response was: {}", projectId, fullResponseBuffer, e);
                        }
                    });
                })
                .doOnError(error -> log.error("Error during streaming for projectId: {}", projectId))
                .map(response -> {
                    if(response.getResult() == null) {
                        return new StreamResponse("");
                    }
                    String text = response.getResult().getOutput().getText();
                    return new StreamResponse(text != null ? text : "");
                });
    }

    private void finalizeChats(String userMessage, ChatSession chatSession, String fullText, Long duration, Usage usage) {
        Long projectId = chatSession.getProject().getId();

        Integer promptTokens = null;
        Integer completionTokens = null;

        if(usage != null) {
            usageService.recordTokenUsage(chatSession.getUser().getId(), usage.getTotalTokens());
            promptTokens = usage.getPromptTokens();
            completionTokens = usage.getCompletionTokens();
        }

        chatMessageRepository.save(
                ChatMessage.builder()
                        .chatSession(chatSession)
                        .role(MessageRole.USER)
                        .content(userMessage)
                        .tokensUsed(promptTokens)
                        .build()
        );

        ChatMessage assistantChatMessage = ChatMessage.builder()
                .role(MessageRole.ASSISTANT)
                .content("Assistant Message here...")
                .chatSession(chatSession)
                .tokensUsed(completionTokens)
                .build();

        assistantChatMessage = chatMessageRepository.save(assistantChatMessage);

        List<ChatEvent> chatEventList = llmResponseParser.parseChatEvents(fullText, assistantChatMessage);
        long fileEditCount = chatEventList.stream().filter(e -> e.getType() == ChatEventType.FILE_EDIT).count();
        log.info("Parsed {} chat event(s) ({} file edit(s)) for projectId: {}", chatEventList.size(), fileEditCount, projectId);

        chatEventList.addFirst(ChatEvent.builder()
                        .type(ChatEventType.THOUGHT)
                        .chatMessage(assistantChatMessage)
                        .content("Thought for "+duration+"s")
                        .sequenceOrder(0)
                .build());

        List<ChatEvent> fileEditEvents = chatEventList.stream()
                .filter(e -> e.getType() == ChatEventType.FILE_EDIT)
                .toList();

        int savedCount = 0;
        for (ChatEvent event : fileEditEvents) {
            try {
                projectFileService.saveFile(projectId, event.getFilePath(), event.getContent());
                savedCount++;
            } catch (Exception e) {
                log.error("Failed to save file '{}' for projectId: {}. Skipping this file; other files and " +
                        "chat history are unaffected.", event.getFilePath(), projectId, e);
            }
        }
        if (savedCount < fileEditEvents.size()) {
            log.warn("Saved {}/{} generated file(s) for projectId: {}", savedCount, fileEditEvents.size(), projectId);
        }

        chatEventRepository.saveAll(chatEventList);
    }

    private ChatSession createChatSessionIfNotExists(Long projectId, Long userId) {
        ChatSessionId chatSessionId = new ChatSessionId(projectId, userId);
        ChatSession chatSession = chatSessionRepository.findById(chatSessionId).orElse(null);

        if(chatSession == null) {
            Project project = projectRepository.findById(projectId)
                    .orElseThrow(() -> new ResourceNotFoundException("Project", projectId.toString()));
            User user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", userId.toString()));

            chatSession = ChatSession.builder()
                    .id(chatSessionId)
                    .project(project)
                    .user(user)
                    .build();

            chatSession = chatSessionRepository.save(chatSession);
        }
        return chatSession;
    }
}