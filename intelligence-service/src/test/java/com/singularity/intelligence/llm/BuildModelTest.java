package com.singularity.intelligence.llm;

import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import com.singularity.intelligence.service.ProjectFileReader;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.mockito.Answers.RETURNS_SELF;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers when a build call is given the read tool.
 *
 * <p>A model told it already had every file of a small project still read through the tool - one file per round, each
 * round resending the whole conversation - so a call whose project description holds everything must go without the
 * tool, and one that leaves files out must still have it. Also covers that nothing is sent until someone subscribes,
 * and that each subscription builds its own call: the AI library's advisor chain cannot be used twice.
 */
class BuildModelTest {

    private final ChatClient chatClient = mock(ChatClient.class);
    private final ChatClient.ChatClientRequestSpec call = mock(ChatClient.ChatClientRequestSpec.class, RETURNS_SELF);
    private final ChatClient.StreamResponseSpec response = mock(ChatClient.StreamResponseSpec.class);
    private final FileTreeContextAdvisor advisor = mock(FileTreeContextAdvisor.class);
    private final BuildModel buildModel = new BuildModel(chatClient, advisor, new ModelCalls(com.singularity.intelligence.config.AiCallProperties.defaults()));

    private final List<Message> conversation = List.of(new UserMessage("build a todo app"));
    private final CodeGenerationTools tools = new CodeGenerationTools(mock(ProjectFileReader.class), 1L);

    BuildModelTest() {
        when(chatClient.prompt()).thenReturn(call);
        when(call.stream()).thenReturn(response);
        when(response.chatResponse()).thenReturn(Flux.empty());
    }

    private static ProjectBrief briefOf(String... paths) {
        List<FileTreeDto.Entry> tree = java.util.Arrays.stream(paths)
                .map(path -> new FileTreeDto.Entry(path, 20, "text/plain")).toList();
        return ProjectBrief.of(tree, path -> path.endsWith("Huge.tsx") ? null : "export default 1;\n", null);
    }

    @Test
    void aCallThatWasShownEverySourceFileIsNotGivenTheReadTool() {
        ProjectBrief everything = briefOf("package.json", "src/App.tsx");

        buildModel.stream(conversation, tools, everything, com.singularity.intelligence.enums.AiCallKind.BUILD).blockLast();

        verify(call, never()).tools(any(Object[].class));
        verify(call).messages(conversation);
    }

    @Test
    void aCallThatWasNotShownEverythingKeepsTheReadTool() {
        ProjectBrief partial = briefOf("package.json", "src/App.tsx", "src/Huge.tsx");

        buildModel.stream(conversation, tools, partial, com.singularity.intelligence.enums.AiCallKind.BUILD).blockLast();

        verify(call).tools(tools);
    }

    @Test
    void aProjectWithNothingToShowKeepsTheReadToolToo() {
        buildModel.stream(conversation, tools, ProjectBrief.empty(), com.singularity.intelligence.enums.AiCallKind.BUILD).blockLast();

        verify(call).tools(tools);
    }

    @Test
    void nothingIsSentUntilSomeoneSubscribesAndEachSubscriptionBuildsItsOwnCall() {
        Flux<?> stream = buildModel.stream(conversation, tools, ProjectBrief.empty(), com.singularity.intelligence.enums.AiCallKind.BUILD);
        verify(chatClient, never()).prompt();

        stream.blockLast();
        stream.blockLast();

        verify(chatClient, times(2)).prompt();
    }
}
