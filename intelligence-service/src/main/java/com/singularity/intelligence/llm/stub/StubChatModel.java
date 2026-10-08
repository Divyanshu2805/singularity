package com.singularity.intelligence.llm.stub;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * A model that answers from a script, for running the service with no AI provider behind it.
 *
 * <p>Handles: standing in for the provider's chat model when the {@code stub-ai} profile is on; reading a request's
 * system prompt, project description and last message; answering with {@link StubReplies}; streaming that answer in
 * small pieces with a pause between them, so the chat fills in the way a real reply does; and reporting token usage
 * the way a provider does, so metering, the meter and the daily allowance all run for real.
 *
 * <p>It calls no tool. The build's read tool is offered only for a project too large to show whole, and the scripted
 * app never is; the code lens's answers here do not depend on any file.
 *
 * <p>The usage it reports is a count of characters over four, the same rough measure the build turn uses for a call
 * that ended without a report. It is there so that everything downstream of a usage report is exercised, not to be a
 * believable number.
 */
public class StubChatModel implements ChatModel {

    static final int CHUNK_CHARS = 28;
    private static final int CHARS_PER_TOKEN = 4;

    private final Duration chunkDelay;

    public StubChatModel(Duration chunkDelay) {
        this.chunkDelay = chunkDelay == null || chunkDelay.isNegative() ? Duration.ZERO : chunkDelay;
    }

    @Override
    public ChatResponse call(Prompt prompt) {
        String reply = replyTo(prompt);
        return last(reply, prompt, reply);
    }

    @Override
    public Flux<ChatResponse> stream(Prompt prompt) {
        return Flux.defer(() -> {
            String reply = replyTo(prompt);
            List<ChatResponse> pieces = new ArrayList<>();
            int from = 0;
            while (reply.length() - from > CHUNK_CHARS) {
                pieces.add(new ChatResponse(List.of(new Generation(
                        new AssistantMessage(reply.substring(from, from + CHUNK_CHARS))))));
                from += CHUNK_CHARS;
            }
            pieces.add(last(reply.substring(from), prompt, reply));
            Flux<ChatResponse> stream = Flux.fromIterable(pieces);
            return chunkDelay.isZero() ? stream : stream.delayElements(chunkDelay);
        });
    }

    private static String replyTo(Prompt prompt) {
        String system = null;
        StringBuilder project = new StringBuilder();
        String request = "";
        for (Message message : prompt.getInstructions()) {
            String text = message.getText() == null ? "" : message.getText();
            if (message.getMessageType() == MessageType.SYSTEM) {
                if (system == null) {
                    system = text;
                } else {
                    project.append(text);
                }
            } else if (message.getMessageType() == MessageType.USER) {
                request = text;
            }
        }
        return StubReplies.replyTo(StubReplies.callOf(system), project.toString(), request);
    }

    private static ChatResponse last(String piece, Prompt prompt, String wholeReply) {
        long sent = 0;
        for (Message message : prompt.getInstructions()) {
            sent += message.getText() == null ? 0 : message.getText().length();
        }
        int promptTokens = (int) Math.max(1, sent / CHARS_PER_TOKEN);
        int completionTokens = Math.max(1, wholeReply.length() / CHARS_PER_TOKEN);
        return new ChatResponse(
                List.of(new Generation(new AssistantMessage(piece),
                        ChatGenerationMetadata.builder().finishReason("stop").build())),
                ChatResponseMetadata.builder().model("stub").usage(new DefaultUsage(promptTokens, completionTokens)).build());
    }
}
