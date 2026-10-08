package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.stub.StubReplies;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the suggestions prompt and the reading of its answer.
 *
 * <p>The answer becomes buttons that send a build request when pressed, so the cases are about what must never
 * reach a button - markup, a tag, a paragraph, a heading for a list - and about still getting three clean lines
 * out of the wrappers a model adds whatever it is told: numbers, bullets, quotes, bold. Also that the prompt is
 * handed paths and never a file's content, and that the scripted model recognises it.
 */
class SuggestionPromptsTest {

    @Test
    void threePlainLinesAreThreeSuggestions() {
        assertThat(SuggestionPrompts.parse("Add a search box that filters the notes\nLet me pin a note to the top\nAdd a dark theme switch"))
                .containsExactly("Add a search box that filters the notes", "Let me pin a note to the top", "Add a dark theme switch");
    }

    @Test
    void numbersBulletsQuotesBoldAndFullStopsAreTakenOff() {
        String answer = """
                1. Add a search box that filters the notes.
                - "Let me pin a note to the top"
                * **Add a dark theme switch**
                """;

        assertThat(SuggestionPrompts.parse(answer))
                .containsExactly("Add a search box that filters the notes", "Let me pin a note to the top", "Add a dark theme switch");
    }

    @Test
    void anIntroductionThatEndsInAColonIsNotASuggestion() {
        assertThat(SuggestionPrompts.parse("Here are three ideas for your app:\nAdd a search box that filters the notes"))
                .containsExactly("Add a search box that filters the notes");
    }

    @Test
    void aLineHoldingATagOrCodeNeverBecomesAButton() {
        String answer = """
                <file path="src/App.tsx">export {}</file>
                Use `useEffect` to load the notes
                Add a counter above the list
                """;

        assertThat(SuggestionPrompts.parse(answer)).containsExactly("Add a counter above the list");
    }

    @Test
    void aParagraphOrAFragmentIsLeftOut() {
        assertThat(SuggestionPrompts.parse("Ok\n" + "Add ".repeat(40) + "\nAdd a counter above the list"))
                .containsExactly("Add a counter above the list");
    }

    @Test
    void noMoreThanThreeAndNoRepeats() {
        assertThat(SuggestionPrompts.parse("Add a counter above the list\nadd a counter above the list\n"
                + "Add a search box\nAdd a dark theme\nAdd an export button"))
                .containsExactly("Add a counter above the list", "Add a search box", "Add a dark theme");
    }

    @Test
    void nothingUsableIsNoSuggestionsNotAnError() {
        assertThat(SuggestionPrompts.parse(null)).isEmpty();
        assertThat(SuggestionPrompts.parse("   ")).isEmpty();
        assertThat(SuggestionPrompts.parse("<message>Done.</message>")).isEmpty();
    }

    @Test
    void theModelIsToldWhatWasAskedSaidAndTouchedWithinLimits() {
        List<String> manyPaths = new ArrayList<>();
        for (int index = 0; index < 200; index++) {
            manyPaths.add("src/components/Part" + index + ".tsx");
        }

        String block = SuggestionPrompts.block("x".repeat(20_000), "Notes are saved in the browser.",
                List.of("src/pages/Index.tsx"), manyPaths);

        assertThat(block).contains("What they asked for:").contains("Notes are saved in the browser.")
                .contains("src/pages/Index.tsx").contains("src/components/Part39.tsx").doesNotContain("Part40.tsx");
        assertThat(block.length()).isLessThan(5_000);
    }

    @Test
    void theScriptedModelRecognisesThePromptAndAnswersInAShapeThatParses() {
        assertThat(StubReplies.callOf(SuggestionPrompts.systemPrompt())).isEqualTo(StubReplies.Call.SUGGEST);
        assertThat(SuggestionPrompts.parse(StubReplies.replyTo(StubReplies.Call.SUGGEST, "", ""))).hasSize(3);
    }
}
