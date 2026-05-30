package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.idea.ClarifyIdeaRequest;
import com.java.vibecraft.dto.idea.ClarifyIdeaResponse;
import com.java.vibecraft.dto.idea.ClarifyingQuestion;
import com.java.vibecraft.dto.idea.CompileIdeaRequest;
import com.java.vibecraft.dto.idea.IdeaAnswer;
import com.java.vibecraft.llm.AiUsageRecorder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers the parts of the idea interview that don't depend on the model: how many questions an idea earns,
 * what survives sanitising, and what happens when the AI is unreachable. The questions themselves are written
 * by the model per idea, so nothing here asserts their wording or topics - only the guarantees the client and
 * the DTO contract actually rely on.
 *
 * <p>Deliberately a plain unit test with no Spring context - a {@code @SpringBootTest} here would need a live
 * database, and can't start at all on a Windows JVM reporting the legacy {@code Asia/Calcutta} alias (see
 * CLAUDE.md). The ChatClient is stubbed to fail, so {@code clarify} runs its no-AI path; the model's own path
 * is exercised by calling {@code sanitizeQuestions} with synthetic replies.
 */
class IdeaServiceImplTest {

    private static final String BARE_IDEA = "a todo app";
    private static final String SHAPED_IDEA =
            "a habit tracker for students showing daily streaks and letting them add their own habits";
    private static final String DETAILED_IDEA = """
            A booking site for a small pottery studio, where visitors browse upcoming classes with dates and
            prices, reserve a seat, and pay a deposit. The owner needs a simple admin page to add classes,
            see who is booked, and cancel a session if nobody signs up.""";

    private IdeaServiceImpl ideaService;

    @BeforeEach
    void setUp() {
        ChatClient chatClient = mock(ChatClient.class);
        when(chatClient.prompt()).thenThrow(new IllegalStateException("model unavailable"));
        ideaService = new IdeaServiceImpl(chatClient, mock(AiUsageRecorder.class));
    }

    private int questionsAskedFor(String idea) {
        return ideaService.clarify(new ClarifyIdeaRequest(idea)).questions().size();
    }

    private static ClarifyIdeaResponse reply(ClarifyingQuestion... questions) {
        return new ClarifyIdeaResponse(Arrays.asList(questions));
    }

    private static ClarifyingQuestion question(String id, String text) {
        return new ClarifyingQuestion(id, text, "Because it matters.", List.of("One", "Two", "Three"), false);
    }

    // --- How many questions an idea earns -------------------------------------------------------------

    @Test
    void asksTheMostOfABarePhraseAndTheLeastOfAnIdeaThatAlreadySpecifiesItself() {
        // "a todo app" says almost nothing, so its author is the one who most needs walking through the basics;
        // the pottery brief already names its users, its features and its flow.
        assertThat(questionsAskedFor(BARE_IDEA)).isEqualTo(4);
        assertThat(questionsAskedFor(SHAPED_IDEA)).isEqualTo(3);
        assertThat(questionsAskedFor(DETAILED_IDEA)).isEqualTo(2);
    }

    @Test
    void neverAsksMoreThanFourOrFewerThanTwo() {
        assertThat(questionsAskedFor("app")).isBetween(2, 4);
        assertThat(questionsAskedFor("a")).isBetween(2, 4);
        assertThat(questionsAskedFor("x ".repeat(400))).isBetween(2, 4);
    }

    // --- What the server guarantees about whatever the model writes ------------------------------------

    @Test
    void keepsTheModelsOwnQuestionsAndIdsRatherThanSubstitutingItsOwn() {
        ClarifyIdeaResponse generated = reply(
                question("seat_limits", "How many seats per class?"),
                question("visual_style", "What should it feel like?"));

        List<ClarifyingQuestion> asked = ideaService.sanitizeQuestions(generated, 2);

        assertThat(asked).extracting(ClarifyingQuestion::id).containsExactly("seat_limits", "visual_style");
        assertThat(asked).extracting(ClarifyingQuestion::question)
                .containsExactly("How many seats per class?", "What should it feel like?");
    }

    @Test
    void trimsWhateverTheModelReturnsDownToTheBudget() {
        ClarifyIdeaResponse generated = reply(
                question("one", "First?"), question("two", "Second?"),
                question("three", "Third?"), question("four", "Fourth?"));

        assertThat(ideaService.sanitizeQuestions(generated, 2)).hasSize(2);
    }

    @Test
    void givesEveryQuestionAUniqueIdEvenWhenTheModelDoesNot() {
        // The client keys its answers by id, so a duplicate would silently merge two questions' answers.
        ClarifyIdeaResponse generated = reply(
                question("style", "What should it feel like?"),
                question("style", "Which colours suit it?"),
                question(null, "Who is this for?"));

        List<ClarifyingQuestion> asked = ideaService.sanitizeQuestions(generated, 4);

        assertThat(asked).extracting(ClarifyingQuestion::id).doesNotHaveDuplicates().hasSize(3);
        // An id the model didn't supply is derived from its own question text, not from a canned list.
        assertThat(asked.get(2).id()).isEqualTo("who_is_this_for");
    }

    @Test
    void dropsQuestionsThatCouldNotBeAnswered() {
        ClarifyIdeaResponse generated = reply(
                new ClarifyingQuestion("no_text", "  ", "helper", List.of("One", "Two"), false),
                new ClarifyingQuestion("one_option", "Pick one?", "helper", List.of("Only"), false),
                new ClarifyingQuestion("no_options", "Pick one?", "helper", null, false),
                question("usable", "Which classes recur weekly?"));

        assertThat(ideaService.sanitizeQuestions(generated, 4))
                .extracting(ClarifyingQuestion::id).containsExactly("usable");
    }

    @Test
    void fallsBackToGenericQuestionsOnlyWhenNothingUsableSurvives() {
        assertThat(ideaService.sanitizeQuestions(null, 3)).hasSize(3);
        assertThat(ideaService.sanitizeQuestions(new ClarifyIdeaResponse(null), 3)).hasSize(3);
        assertThat(ideaService.sanitizeQuestions(reply(), 3)).hasSize(3);
        // The generic set keeps the style question last, matching what the model is told to do.
        assertThat(ideaService.sanitizeQuestions(null, 3)).last()
                .extracting(ClarifyingQuestion::id).isEqualTo("style");
    }

    @Test
    void capsIdsAndTextAtTheLengthsTheDtoContractAllows() {
        ClarifyingQuestion oversized = new ClarifyingQuestion(
                "x".repeat(200), "q".repeat(300), "h".repeat(400),
                List.of("o".repeat(100), "another option"), true);

        ClarifyingQuestion asked = ideaService.sanitizeQuestions(reply(oversized), 1).getFirst();

        assertThat(asked.id()).hasSizeLessThanOrEqualTo(50);
        assertThat(asked.question()).hasSizeLessThanOrEqualTo(120);
        assertThat(asked.helper()).hasSizeLessThanOrEqualTo(160);
        assertThat(asked.options()).allSatisfy(option -> assertThat(option).hasSizeLessThanOrEqualTo(60));
        // multiSelect is the model's call, and is passed through untouched.
        assertThat(asked.multiSelect()).isTrue();
    }

    // --- The no-AI brief ------------------------------------------------------------------------------

    @Test
    void fallsBackToABriefBuiltFromWhateverWasAskedWhenTheModelIsDown() {
        // Ids here are invented, as the model's would be - the brief can't assume it knows any of them.
        String spec = ideaService.compile(new CompileIdeaRequest("a pottery class booking site", List.of(
                new IdeaAnswer("seat_limits", "How many seats per class?", List.of("Six to ten")),
                new IdeaAnswer("deposit_rules", "What happens on cancellation?", List.of("Refund in full", "Credit a future class")),
                new IdeaAnswer("visual_style", "What should it feel like?", List.of("Warm and handmade"))
        ))).spec();

        assertThat(spec).contains("**Build:** a pottery class booking site");
        assertThat(spec).contains("- How many seats per class: Six to ten");
        assertThat(spec).contains("- What happens on cancellation: Refund in full, Credit a future class");
        assertThat(spec).contains("- What should it feel like: Warm and handmade");
    }

    @Test
    void leavesSkippedQuestionsOutOfTheBrief() {
        String spec = ideaService.compile(new CompileIdeaRequest("a recipe box", List.of(
                new IdeaAnswer("visual_style", "What should it feel like?", List.of("Warm and homely")),
                new IdeaAnswer("sharing", "Who can see your recipes?", List.of())
        ))).spec();

        assertThat(spec).contains("- What should it feel like: Warm and homely");
        assertThat(spec).doesNotContain("Who can see your recipes");
    }
}
