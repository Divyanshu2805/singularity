package com.singularity.intelligence.llm.stub;

import com.singularity.intelligence.enums.LearnerLevel;
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
    void theLessonAndOverviewPromptsAreRecognisedAtEveryLevel() {
        for (LearnerLevel level : LearnerLevel.values()) {
            assertThat(StubReplies.callOf(CodeInsightPrompts.lessonSystemPrompt(level))).isEqualTo(StubReplies.Call.LESSON);
            assertThat(StubReplies.callOf(CodeInsightPrompts.overviewSystemPrompt(level))).isEqualTo(StubReplies.Call.OVERVIEW);
            assertThat(StubReplies.callOf(CodeInsightPrompts.askSystemPrompt(level))).isEqualTo(StubReplies.Call.ANSWER);
        }
        assertThat(answer(CodeInsightPrompts.lessonSystemPrompt(), "the change")).contains("### Check yourself");
        assertThat(answer(CodeInsightPrompts.overviewSystemPrompt(null), "the turn"))
                .contains("### The pieces").contains("### How it works").contains("### Ideas in this build")
                .doesNotContain("Where to start");
    }

    @Test
    void theTourGlossaryTaskAndCheckPromptsAreRecognisedAndAnswered() {
        for (LearnerLevel level : LearnerLevel.values()) {
            assertThat(StubReplies.callOf(CodeInsightPrompts.tourSystemPrompt(level))).isEqualTo(StubReplies.Call.TOUR);
            assertThat(StubReplies.callOf(CodeInsightPrompts.glossarySystemPrompt(level))).isEqualTo(StubReplies.Call.GLOSSARY);
            assertThat(StubReplies.callOf(CodeInsightPrompts.taskSystemPrompt(level))).isEqualTo(StubReplies.Call.TASK);
            assertThat(StubReplies.callOf(CodeInsightPrompts.taskCheckSystemPrompt(level))).isEqualTo(StubReplies.Call.TASK_CHECK);
        }
        assertThat(answer(CodeInsightPrompts.tourSystemPrompt(null), "files"))
                .contains("### The files").contains("### How a click travels").contains("### Where to change things");
        assertThat(answer(CodeInsightPrompts.glossarySystemPrompt(null), "word"))
                .contains("### Think of it like").contains("### In your project");
        assertThat(answer(CodeInsightPrompts.taskSystemPrompt(null), "change"))
                .contains("### L1 · Where to look").contains("### Done when");
        assertThat(CodeInsightPrompts.isDoneVerdict(answer(CodeInsightPrompts.taskCheckSystemPrompt(null), "task"))).isTrue();
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
