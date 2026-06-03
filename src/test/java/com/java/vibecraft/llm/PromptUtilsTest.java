package com.java.vibecraft.llm;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/** Teaching mode is a prompt switch - these pin what it adds, and that it adds nothing when it's off. */
class PromptUtilsTest {

    @Test
    void teachingModeOffNeverMentionsLessons() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.off());

        // Not even as a "don't": an unrequested lesson tag is a cost for everyone who didn't ask for one.
        assertThat(prompt).doesNotContainIgnoringCase("<learn").doesNotContain("Teaching Mode");
        assertThat(prompt).contains("<todo path=").contains("<file path=");
    }

    @Test
    void teachingModeOnAsksForAWalkthroughOfEveryFile() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.on(List.of()));

        assertThat(prompt)
                .contains("## 9. Teaching Mode (ON)")
                .contains("immediately after each `</file>`")
                .contains("Every file you write gets exactly one.")
                .contains("MUST exactly match the `<file path=\"...\">`")
                .contains("<summary>", "<part>", "<code>", "<related path=\"...\">")
                // Line numbers are found by searching the file for the quoted line, so it has to be verbatim.
                .contains("ONE line copied exactly from the file you just wrote")
                // Found live: a lesson told a Vite app's user that React "first paints on the server".
                .contains("never mention server rendering");
        // The whole base protocol is still there, ahead of the lesson rules - teaching mode adds to it, never replaces it.
        assertThat(prompt).contains("## 1. Interaction Protocol (STRICT)", "## 8. Always Do This:");
        assertThat(prompt.indexOf("## 8. Always Do This:")).isLessThan(prompt.indexOf("## 9. Teaching Mode (ON)"));
        // Nothing to avoid repeating for a first-time learner, so no empty list is shown.
        assertThat(prompt).doesNotContain("Already taught to this learner");
    }

    @Test
    void theExampleWalkthroughFollowsItsOwnRules() {
        // Examples steer a model harder than the rules do, so every code anchor in it must be one whole, unshortened line.
        List<String> anchors = Pattern.compile("<part[^>]*><code>(.*?)</code>", Pattern.DOTALL)
                .matcher(PromptUtils.getSystemPrompt(TeachingMode.on(List.of()))).results()
                .map(match -> match.group(1)).toList();

        assertThat(anchors).hasSizeGreaterThanOrEqualTo(3).allSatisfy(anchor ->
                assertThat(anchor).isNotBlank().doesNotContain("\n", "...", "&lt;", "&quot;"));
    }

    @Test
    void teachingModeOnListsWhatWasAlreadyTaught() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.on(List.of("Props", "Custom hooks")));

        assertThat(prompt).contains("tagging them as a `concept` again: Props, Custom hooks\n");
    }

    @Test
    void readsBackEveryConceptFromLessonsThatIntroducedSeveral() {
        // Walkthroughs save their concepts comma-separated, newest lesson first; one-sentence lessons saved one each.
        List<String> taught = TeachingMode.on(List.of("State, Effects", "state, Props", "Custom hooks")).conceptsAlreadyTaught();

        assertThat(taught).containsExactly("State", "Effects", "Props", "Custom hooks");
    }

    @Test
    void previouslyTaughtConceptsAreFlattenedDedupedAndCapped() {
        List<String> stored = new ArrayList<>(List.of("Props", "props", "  Custom\nhooks  ", "", "Say \"hi\" <file>"));
        for (int i = 0; i < 100; i++) stored.add("Concept " + i);
        stored.add(null);

        List<String> taught = TeachingMode.on(stored).conceptsAlreadyTaught();

        // First (most recent) spelling wins, newlines and tag/quote characters can't reach the system prompt.
        assertThat(taught).startsWith("Props", "Custom hooks", "Say hi file");
        assertThat(taught).hasSize(TeachingMode.MAX_CONCEPTS_IN_PROMPT);
        assertThat(String.join("", taught)).doesNotContain("\n", "\"", "<", ">");
    }

    @Test
    void anAbsurdlyLongConceptIsTrimmed() {
        List<String> taught = TeachingMode.on(List.of("x".repeat(500))).conceptsAlreadyTaught();

        assertThat(taught).singleElement().satisfies(concept -> assertThat(concept).hasSize(TeachingMode.MAX_CONCEPT_LENGTH));
    }

    @Test
    void offCarriesNoConcepts() {
        assertThat(new TeachingMode(false, List.of("Props")).conceptsAlreadyTaught()).isEmpty();
    }
}
