package com.singularity.intelligence.llm;

import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.enums.AiCallKind;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.openai.OpenAiChatOptions;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.RETURNS_SELF;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Covers which model and reasoning effort a kind of call is sent with.
 *
 * <p>A kind that configures nothing must leave the request untouched, so it runs on the service's one model exactly as
 * every call did before kinds existed; a kind that configures something must send only that, because the AI library
 * fills the rest from the service's defaults and anything set here would override them.
 */
class ModelCallsTest {

    private final ChatClient.ChatClientRequestSpec request = mock(ChatClient.ChatClientRequestSpec.class, RETURNS_SELF);

    @Test
    void aKindThatConfiguresNothingLeavesTheRequestAsItWas() {
        ModelCalls calls = new ModelCalls(AiCallProperties.defaults());

        assertThat(calls.apply(request, AiCallKind.BUILD)).isSameAs(request);

        verify(request, never()).options(any(ChatOptions.class));
    }

    @Test
    void aKindIsSentWithItsOwnModelAndReasoningEffortAndNothingElse() {
        ModelCalls calls = new ModelCalls(new AiCallProperties(Map.of(
                AiCallKind.LESSON, new AiCallProperties.Call("small-model", "low"))));

        calls.apply(request, AiCallKind.LESSON);

        ArgumentCaptor<ChatOptions> sent = ArgumentCaptor.forClass(ChatOptions.class);
        verify(request).options(sent.capture());
        OpenAiChatOptions options = (OpenAiChatOptions) sent.getValue();
        assertThat(options.getModel()).isEqualTo("small-model");
        assertThat(options.getReasoningEffort()).isEqualTo("low");
        assertThat(options.getTemperature()).isNull();
        assertThat(options.getMaxTokens()).isNull();
    }

    @Test
    void oneKindsChoiceDoesNotReachAnother() {
        ModelCalls calls = new ModelCalls(new AiCallProperties(Map.of(
                AiCallKind.REPAIR, new AiCallProperties.Call(null, "low"))));

        calls.apply(request, AiCallKind.BUILD);

        verify(request, never()).options(any(ChatOptions.class));
    }

    @Test
    void aBlankValueIsTheSameAsNoValue() {
        ModelCalls calls = new ModelCalls(new AiCallProperties(Map.of(
                AiCallKind.EXPLAIN, new AiCallProperties.Call("  ", ""))));

        calls.apply(request, AiCallKind.EXPLAIN);

        verify(request, never()).options(any(ChatOptions.class));
    }
}
