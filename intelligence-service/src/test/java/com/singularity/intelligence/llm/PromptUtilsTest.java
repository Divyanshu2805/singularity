package com.singularity.intelligence.llm;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the properties of the build prompt that are easy to break without noticing: its text must be identical
 * between requests except for the last line (or the provider's prompt cache never hits), it must describe the starter
 * template that exists rather than a UI kit that does not, and it must carry the rules for asking the user a question.
 */
class PromptUtilsTest {

    @Test
    @DisplayName("the only part that changes between requests is the last line, and it is a date, not a time")
    void theChangingPartIsLast() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.off());
        String lastLine = prompt.strip().lines().reduce((first, second) -> second).orElseThrow();

        assertThat(lastLine).isEqualTo("Today's date: " + LocalDate.now());
        assertThat(prompt.substring(0, prompt.lastIndexOf("Today's date:")))
                .doesNotContain(String.valueOf(LocalDate.now().getYear()));
    }

    @Test
    @DisplayName("with teaching mode on the date is still the last line, after the teaching section")
    void theDateStaysLastWithTeachingOn() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.on(List.of("State")));

        assertThat(prompt.strip()).endsWith("Today's date: " + LocalDate.now());
        assertThat(prompt.indexOf("Teaching Mode (ON)")).isLessThan(prompt.lastIndexOf("Today's date:"));
    }

    @Test
    @DisplayName("it does not tell the model to use a UI kit or helper the starter template does not have")
    void itDescribesTheTemplateThatExists() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.off());

        assertThat(prompt).doesNotContain("Prioritize @/components/ui").doesNotContain("Max 100 lines");
        assertThat(prompt).contains("NO shadcn/ui").contains("daisyUI component classes");
    }

    @Test
    @DisplayName("it explains when to ask the user, and that a turn which asks writes nothing")
    void itCarriesTheAskRules() {
        String prompt = PromptUtils.getSystemPrompt(TeachingMode.off());

        assertThat(prompt).contains("<ask options=").contains("A response that asks writes NOTHING");
    }
}
