package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.ProjectTitlePrompts;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.service.ProjectTitleService;
import com.singularity.intelligence.service.UsageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Writes the title of a project that has none: what the app is, in a few words, for the sidebar, the project's header,
 * its card and search.
 *
 * <p>Handles: answering with the title a project already has and spending nothing; otherwise finding the first thing
 * the caller asked for on the project, asking a model for a title from it, metering that call, and handing the title
 * to workspace-service, which stores it only if the project still has none - so a rename that lands while the model
 * is answering wins - and answers with whatever the project holds then.
 *
 * <p>Most projects never come here: the idea interview's model writes a title with its questions and the project is
 * created with it. This is for the rest - projects made before titles existed, and those whose interview could not
 * reach a model - and the browser asks for it, for a project it shows without a title, the way a chat app asks for a
 * conversation's title once its first message is in.
 *
 * <p>It answers empty for everything that is not a clean title: no request to write from (a project nobody has
 * built in yet, or one built by someone else), no allowance left, a provider that failed, an answer with nothing
 * usable in it, a title workspace-service could not store. An untitled project shows its name, which is a fine
 * answer; an error would not be.
 *
 * <p>Only someone who may edit the project can ask, because the title is stored for everyone on it - and it is
 * written from the caller's own conversation and nobody else's. The model is given that one request and no file and
 * no tool. The call is a few hundred tokens in and a dozen out, charged to the caller's allowance as project naming.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProjectTitleServiceImpl implements ProjectTitleService {

    private final AuthUtil authUtil;
    private final WorkspaceServiceClient workspaceServiceClient;
    private final ChatMessageRepository chatMessageRepository;
    private final UsageService usageService;
    private final AiUsageRecorder aiUsageRecorder;
    private final ChatClient chatClient;
    private final ModelCalls modelCalls;

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public Optional<String> title(Long projectId) {
        ProjectSummaryDto project = workspaceServiceClient.getProjectSummary(projectId);
        if (project.title() != null && !project.title().isBlank()) {
            return Optional.of(project.title());
        }
        Long userId = authUtil.getCurrentUserId();
        List<String> first = chatMessageRepository.findFirstRequests(projectId, userId, PageRequest.of(0, 1));
        String request = first.isEmpty() || first.getFirst() == null ? "" : first.getFirst().strip();
        if (request.isEmpty()) {
            return Optional.empty();
        }

        UsageReservation reservation;
        try {
            reservation = usageService.reserveBudget(UsageFeature.PROJECT_NAMING);
        } catch (QuotaExceededException spent) {
            return Optional.empty();
        }
        String title;
        try {
            ChatResponse response = modelCalls.apply(chatClient.prompt(), AiCallKind.INTERVIEW)
                    .system(ProjectTitlePrompts.systemPrompt())
                    .user(ProjectTitlePrompts.block(request))
                    .call()
                    .chatResponse();
            aiUsageRecorder.reconcile(reservation, response, UsageFeature.PROJECT_NAMING, projectId);
            title = ProjectTitlePrompts.parse(response == null || response.getResult() == null ? null
                    : response.getResult().getOutput().getText());
        } catch (RuntimeException e) {
            aiUsageRecorder.release(reservation);
            log.warn("Couldn't write a title for projectId: {}", projectId, e);
            return Optional.empty();
        }
        if (title == null) {
            log.warn("The model's title for projectId: {} had nothing usable in it", projectId);
            return Optional.empty();
        }
        try {
            ProjectTitleDto stored = workspaceServiceClient.titleProject(projectId, new ProjectTitleDto(title));
            return Optional.ofNullable(stored == null ? null : stored.title()).filter(text -> !text.isBlank());
        } catch (RuntimeException e) {
            log.warn("Couldn't store the title written for projectId: {}", projectId, e);
            return Optional.empty();
        }
    }
}
