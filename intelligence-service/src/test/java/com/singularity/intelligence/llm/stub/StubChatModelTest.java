package com.singularity.intelligence.llm.stub;

import com.singularity.intelligence.llm.CodeInsightPrompts;
import com.singularity.intelligence.llm.PromptUtils;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the scripted model's side of each call the service makes.
 *
 * <p>The stub recognises a call by the opening words of its system prompt. Those words live in other classes, so a
 * prompt reworded there would quietly turn every build into "this is the stub model's answer" - which is what the
 * first cases guard, by asking with the real prompts. The rest cover the two things a stand-in for a provider must
 * get right for the code around it to run as it does in production: a streamed reply that adds up to the whole
 * reply, and a usage report on its last piece.
 */
class StubChatModelTest {

    private final StubChatModel model = new StubChatModel(Duration.ZERO);

    private static Prompt prompt(String system, String request) {
        return new Prompt(List.of(new SystemMessage(system), new UserMessage(request)));
    }

    private String answer(String system, String request) {
        return model.call(prompt(system, request)).getResult().getOutput().getText();
    }

    @Test
    void theRealBuildPromptIsRecognisedAsABuild() {
        assertThat(StubReplies.callOf(PromptUtils.getSystemPrompt())).isEqualTo(StubReplies.Call.BUILD);
        assertThat(PromptUtils.replyShape()).startsWith(StubReplies.REPLY_SHAPE_MARKER);
    }

    @Test
    void theRealLessonPromptIsRecognisedAsALesson() {
        assertThat(StubReplies.callOf(CodeInsightPrompts.lessonSystemPrompt())).isEqualTo(StubReplies.Call.LESSON);
        assertThat(answer(CodeInsightPrompts.lessonSystemPrompt(), "the change"))
                .contains("### L1").contains("### What happens next");
    }

    @Test
    void anExplanationOrAQuestionAboutCodeGetsPlainWords() {
        assertThat(StubReplies.callOf(CodeInsightPrompts.explainSystemPrompt())).isEqualTo(StubReplies.Call.ANSWER);
        assertThat(StubReplies.callOf(CodeInsightPrompts.askSystemPrompt())).isEqualTo(StubReplies.Call.ANSWER);
        assertThat(answer(CodeInsightPrompts.askSystemPrompt(), "what is this?")).doesNotContain("<message>");
    }

    @Test
    void aBuildCallThatCarriesAReplyOnGetsOnlyAClosingWord() {
        String reply = answer(PromptUtils.getSystemPrompt(), "Your previous reply ended before the work was finished.");

        assertThat(reply).isEqualTo("<message>That is everything for this change.</message>");
    }

    @Test
    void aStreamedReplyAddsUpToTheWholeReplyAndEndsWithAUsageReport() {
        Prompt build = prompt(PromptUtils.getSystemPrompt(), "a notes app" + PromptUtils.replyShape());

        List<ChatResponse> pieces = model.stream(build).collectList().block();

        assertThat(pieces).hasSizeGreaterThan(10);
        StringBuilder streamed = new StringBuilder();
        pieces.forEach(piece -> streamed.append(piece.getResult().getOutput().getText()));
        assertThat(streamed.toString()).isEqualTo(model.call(build).getResult().getOutput().getText());

        ChatResponse last = pieces.getLast();
        assertThat(last.getResult().getMetadata().getFinishReason()).isEqualTo("stop");
        assertThat(last.getMetadata().getUsage().getPromptTokens()).isPositive();
        assertThat(last.getMetadata().getUsage().getCompletionTokens()).isPositive();
    }
}
