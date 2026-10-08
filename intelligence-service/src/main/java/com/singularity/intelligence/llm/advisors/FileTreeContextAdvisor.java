package com.singularity.intelligence.llm.advisors;

import com.singularity.common.dto.FileTreeDto;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.PromptUtils;
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

/**
 * Puts the project's shape in front of the model on every build call.
 *
 * <p>Handles: describing a project - fetching its file tree, the files worth showing whole and the project summary
 * from workspace-service and handing them to {@link ProjectBrief} - and inserting that description as a system
 * message after the main prompt.
 *
 * <p>The description is made once per turn and passed in with each call ({@link #BRIEF}), so every call of a turn -
 * the first, a reply being carried on, a repair - sees the same project, and the read tool can be told which files
 * were already shown. A call that arrives without one is described on the spot.
 *
 * <p>A file that cannot be read is left out, never a reason to fail the call: the model can still ask for it.
 *
 * <p>It sits after the main prompt, never inside it, because it differs for every project and turn; the long prompt
 * before it stays identical between calls and can be served from the provider's cache. The message closes with a
 * short restatement of the output format, so that the format - not a page of source - is the last instruction the
 * model reads before the request.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FileTreeContextAdvisor implements StreamAdvisor {

    public static final String BRIEF = "projectBrief";
    public static final String PROJECT_ID = "projectId";

    private final WorkspaceServiceClient workspaceServiceClient;

    public ProjectBrief describe(Long projectId) {
        return describe(projectId, ProjectBrief.Focus.NONE);
    }

    public ProjectBrief describe(Long projectId, ProjectBrief.Focus focus) {
        List<FileTreeDto.Entry> tree = workspaceServiceClient.getFileTree(projectId).entries();
        ProjectSummaryDto summary = workspaceServiceClient.getProjectSummary(projectId);
        return ProjectBrief.of(tree, path -> read(projectId, path), summary == null ? null : summary.templateInitIssue(),
                focus);
    }

    private String read(Long projectId, String path) {
        try {
            return workspaceServiceClient.getFileContent(projectId, path).content();
        } catch (RuntimeException e) {
            log.warn("Couldn't read {} of project {} for the prompt - the model can still read it itself", path, projectId, e);
            return null;
        }
    }

    @Override
    public Flux<ChatClientResponse> adviseStream(ChatClientRequest request, StreamAdvisorChain streamAdvisorChain) {
        return streamAdvisorChain.nextStream(withProjectBrief(request));
    }

    private ChatClientRequest withProjectBrief(ChatClientRequest request) {
        List<Message> incoming = request.prompt().getInstructions();
        List<Message> messages = new ArrayList<>(incoming.size() + 1);

        incoming.stream().filter(message -> message.getMessageType() == MessageType.SYSTEM).findFirst().ifPresent(messages::add);
        messages.add(new SystemMessage(projectContext(briefFor(request))));
        incoming.stream().filter(message -> message.getMessageType() != MessageType.SYSTEM).forEach(messages::add);

        return request.mutate().prompt(new Prompt(messages, request.prompt().getOptions())).build();
    }

    static String projectContext(String brief) {
        return brief + PromptUtils.closingReminder();
    }

    private String briefFor(ChatClientRequest request) {
        if (request.context().get(BRIEF) instanceof String brief) {
            return brief;
        }
        Long projectId = Long.parseLong(request.context().getOrDefault(PROJECT_ID, 0).toString());
        return describe(projectId).text();
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
