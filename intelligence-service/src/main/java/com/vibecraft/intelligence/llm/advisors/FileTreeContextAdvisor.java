package com.vibecraft.intelligence.llm.advisors;

import com.vibecraft.common.dto.FileTreeDto;
import com.vibecraft.common.dto.ProjectSummaryDto;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.StreamAdvisor;
import org.springframework.ai.chat.client.advisor.api.StreamAdvisorChain;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Puts the project's shape in front of the model before every build turn.
 *
 * <p>Handles: fetching the file tree and the project summary from workspace-service and inserting them as a system
 * message after the main prompt, so the model knows which files exist without being handed their contents - it reads
 * what it needs with the read tool instead.
 *
 * <p>It also passes on any unfinished starter-template problem, telling the model to create the missing scaffolding
 * itself rather than assuming it is there.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileTreeContextAdvisor implements StreamAdvisor {

    private final WorkspaceServiceClient workspaceServiceClient;

    @Override
    public Flux<ChatClientResponse> adviseStream(ChatClientRequest request, StreamAdvisorChain streamAdvisorChain) {
        Map<String, Object> context = request.context();
        Long projectId = Long.parseLong(context.getOrDefault("projectId", 0).toString());

        ChatClientRequest augmentedChatClientRequest = augmentRequestWithFileTree(request, projectId);

        return streamAdvisorChain.nextStream(augmentedChatClientRequest);
    }

    private ChatClientRequest augmentRequestWithFileTree(ChatClientRequest request, Long projectId) {

        List<Message> incomingMessages = request.prompt().getInstructions();

        Message systemMessage = incomingMessages.stream()
                .filter(m -> m.getMessageType() == MessageType.SYSTEM)
                .findFirst()
                .orElse(null);

        List<Message> userMessages = incomingMessages.stream()
                .filter(m -> m.getMessageType() != MessageType.SYSTEM)
                .toList();

        List<Message> allMessages = new ArrayList<>();

        if (systemMessage != null) {
            allMessages.add(systemMessage);
        }

        List<FileTreeDto.Entry> fileTree = workspaceServiceClient.getFileTree(projectId).entries();
        StringBuilder fileTreeContext = new StringBuilder("\n\n ---- FILE_TREE ----\n").append(fileTree);

        ProjectSummaryDto summary = workspaceServiceClient.getProjectSummary(projectId);
        String issue = summary.templateInitIssue();
        if (issue != null && !issue.isBlank()) {
            fileTreeContext.append("\n\n ---- NOTICE ----\n")
                    .append("This project's starter template did not finish setting up correctly: ")
                    .append(issue)
                    .append(" If the project seems to be missing expected configuration or scaffold files, ")
                    .append("create them yourself as needed.");
        }

        allMessages.add(new SystemMessage(fileTreeContext.toString()));

        allMessages.addAll(userMessages);

        return request
                .mutate()
                .prompt(new Prompt(allMessages, request.prompt().getOptions()))
                .build();
    }

    @Override
    public String getName() {
        return "FileTreeContextAdvisor";
    }

    @Override
    public int getOrder() {
        return 0;
    }
}

