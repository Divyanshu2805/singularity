package com.singularity.intelligence.llm;

import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.enums.AiCallKind;
import lombok.RequiredArgsConstructor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

/**
 * Applies a kind of call's model and reasoning effort to a request that is being built.
 *
 * <p>Handles: turning the configured choice for a kind into the options the request carries, and leaving a request
 * alone when the kind sets nothing.
 *
 * <p>Only the two chosen fields are set. The AI library merges a request's options over the service's defaults, so
 * the temperature, the output limit and the usage report every call depends on stay as they are configured; building
 * a complete set of options here would silently drop whichever of those this class did not know about.
 */
@Component
@RequiredArgsConstructor
public class ModelCalls {

    private final AiCallProperties properties;

    public ChatClient.ChatClientRequestSpec apply(ChatClient.ChatClientRequestSpec request, AiCallKind kind) {
        AiCallProperties.Call call = properties.of(kind);
        if (call.isDefault()) {
            return request;
        }
        OpenAiChatOptions.Builder options = OpenAiChatOptions.builder();
        if (call.model() != null && !call.model().isBlank()) {
            options.model(call.model().strip());
        }
        if (call.reasoningEffort() != null && !call.reasoningEffort().isBlank()) {
            options.reasoningEffort(call.reasoningEffort().strip());
        }
        return request.options(options.build());
    }
}
