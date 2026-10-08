package com.singularity.intelligence.llm;

import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Map;

/**
 * One call to the model that writes a project: the build prompt, the conversation, the read tool and the project's
 * shape, streamed back as it is written.
 *
 * <p>Handles: describing the project once for a turn, and assembling each call the same way every time, so the first
 * pass of a turn, a continuation of a reply that stopped early and an import repair all reach the model with the same
 * prompt, the same tool and the same view of the project. What may differ is the model: a repair is its own kind of
 * call ({@link ModelCalls}), since mending a few named lines needs less of a model than writing the reply did.
 *
 * <p>The call is built inside {@code Flux.defer}, never ahead of time: the AI library's advisor chain is single-use
 * per subscription and throws if a built stream is subscribed to twice. Nothing here retries. A retry attached to
 * this stream would run the whole call again after a later step of it failed - the provider refusing the second
 * round of a tool-calling reply, say - and stream the first round's text to the user a second time. The build
 * pipeline decides what to do with a call that failed, because only it knows what the call had already produced.
 *
 * <p>The read tool is offered only when there is something left to read. When the project's description already
 * holds every source file, a model given the tool still uses it - one file per round, each round resending the whole
 * conversation - so it is simply not given one.
 */
@Component
@RequiredArgsConstructor
public class BuildModel {

    private final ChatClient chatClient;
    private final FileTreeContextAdvisor fileTreeContextAdvisor;
    private final ModelCalls modelCalls;

    public ProjectBrief describe(Long projectId, ProjectBrief.Focus focus) {
        return fileTreeContextAdvisor.describe(projectId, focus);
    }

    public Flux<ChatResponse> stream(List<Message> conversation, CodeGenerationTools tools,
                                     ProjectBrief brief, AiCallKind kind) {
        return Flux.defer(() -> {
            ChatClient.ChatClientRequestSpec call = modelCalls.apply(chatClient.prompt(), kind)
                    .system(PromptUtils.getSystemPrompt(brief.kit()))
                    .messages(conversation)
                    .advisors(advisorSpec -> {
                        advisorSpec.params(Map.of(FileTreeContextAdvisor.BRIEF, brief.text()));
                        advisorSpec.advisors(fileTreeContextAdvisor);
                    });
            if (!brief.showsEverySourceFile()) {
                call = call.tools(tools);
            }
            return call.stream().chatResponse();
        });
    }
}
