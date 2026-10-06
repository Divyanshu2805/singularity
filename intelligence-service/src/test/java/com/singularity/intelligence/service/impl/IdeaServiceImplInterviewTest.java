package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.dto.idea.ClarifyIdeaRequest;
import com.singularity.intelligence.dto.idea.ClarifyIdeaResponse;
import com.singularity.intelligence.dto.idea.ClarifyingQuestion;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.IdeaServiceImpl.GeneratedInterview;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the interview's two promises: the model decides how many questions an idea needs (including none), and a
 * model that cannot be reached is reported rather than disguised.
 *
 * <p>The second one is here because of a real failure: the provider rejected this server's key, the error was caught
 * and logged at warn, and the fixed general questions were returned in the same shape as tailored ones - so the
 * product looked as if it always asked the same four things. The response now says whether its questions were written
 * for the idea, and that flag is what the client shows the user.
 */
class IdeaServiceImplInterviewTest {

    private final ChatClient chatClient = mock(ChatClient.class);
    private final AiUsageRecorder aiUsageRecorder = mock(AiUsageRecorder.class);
    private final UsageService usageService = mock(UsageService.class);
    private final IdeaServiceImpl service = new IdeaServiceImpl(chatClient, aiUsageRecorder, usageService);

    private static ClarifyingQuestion question(String id, String text, String... options) {
        return new ClarifyingQuestion(id, text, "Why it matters.", List.of(options), false);
    }

    @Test
    @DisplayName("a model that cannot be reached gets the general questions, flagged as not tailored, and its reservation back")
    void anUnreachableModelIsReportedNotDisguised() {
        UsageReservation reservation = new UsageReservation(1L, LocalDate.of(2026, 1, 1), 12_000);
        when(usageService.reserveBudget(any())).thenReturn(reservation);
        when(chatClient.prompt()).thenThrow(new IllegalStateException("401 - {\"error\":{\"message\":\"User not found.\"}}"));

        ClarifyIdeaResponse response = service.clarify(new ClarifyIdeaRequest("a recipe app"));

        assertThat(response.tailored()).isFalse();
        assertThat(response.questions()).isNotEmpty();
        verify(aiUsageRecorder).release(reservation);
    }

    @Test
    @DisplayName("a rejected key is named as the cause, so the log says what to fix")
    void aRejectedKeyIsNamedAsTheCause() {
        assertThat(IdeaServiceImpl.describeFailure(new IllegalStateException("401 - User not found.")))
                .contains("OPENROUTER_API_KEY");
        assertThat(IdeaServiceImpl.describeFailure(new IllegalStateException("402 - Insufficient credits")))
                .contains("out of credit");
        assertThat(IdeaServiceImpl.describeFailure(new IllegalStateException("timed out"))).isEqualTo("timed out");
    }

    @Test
    @DisplayName("an idea the model judges complete gets no questions, and that is a tailored answer")
    void noQuestionsIsAValidTailoredAnswer() {
        ClarifyIdeaResponse response = service.tailoredInterview(new GeneratedInterview(List.of()));

        assertThat(response.tailored()).isTrue();
        assertThat(response.questions()).isEmpty();
    }

    @Test
    @DisplayName("the model's own number of questions is kept: one stays one, it is not padded to a fixed count")
    void theModelsOwnCountIsKept() {
        ClarifyIdeaResponse response = service.tailoredInterview(new GeneratedInterview(List.of(
                question("booking_window", "How far ahead can members book?", "Same day", "A week", "A month"))));

        assertThat(response.tailored()).isTrue();
        assertThat(response.questions()).extracting(ClarifyingQuestion::id).containsExactly("booking_window");
    }

    @Test
    @DisplayName("more questions than the cap are cut to the cap")
    void questionsAreCappedAtFive() {
        List<ClarifyingQuestion> many = new ArrayList<>();
        for (int i = 1; i <= 8; i++) {
            many.add(question("q" + i, "Question " + i + "?", "One", "Two", "Three"));
        }

        ClarifyIdeaResponse response = service.tailoredInterview(new GeneratedInterview(many));

        assertThat(response.questions()).hasSize(5);
        assertThat(response.questions().getFirst().id()).isEqualTo("q1");
    }

    @Test
    @DisplayName("a reply with no question list, or with only unusable questions, falls back and says so")
    void anUnusableReplyFallsBackAndSaysSo() {
        assertThat(service.tailoredInterview(null).tailored()).isFalse();
        assertThat(service.tailoredInterview(new GeneratedInterview(null)).tailored()).isFalse();

        ClarifyIdeaResponse onlyBroken = service.tailoredInterview(new GeneratedInterview(List.of(
                question("no_options", "A question with one option?", "Only one"),
                question("blank", "   ", "One", "Two"))));

        assertThat(onlyBroken.tailored()).isFalse();
        assertThat(onlyBroken.questions()).isNotEmpty();
    }

    @Test
    @DisplayName("a question the model sent without a usable id still gets a unique one")
    void idsAreMadeUnique() {
        ClarifyIdeaResponse response = service.tailoredInterview(new GeneratedInterview(List.of(
                question("style", "What should it look like?", "Clean", "Bold", "Dark"),
                question("style", "And the tone of the writing?", "Formal", "Friendly", "Playful"))));

        assertThat(response.questions()).extracting(ClarifyingQuestion::id).containsExactly("style", "style_2");
    }
}
