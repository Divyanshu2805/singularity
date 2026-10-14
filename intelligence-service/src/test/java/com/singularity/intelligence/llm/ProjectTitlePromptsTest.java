package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.stub.StubReplies;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the prompt for a project's title and the reading of its answer.
 *
 * <p>Handles: the answer becoming one short line whatever the model wrapped it in - a label, quotation marks, bold, a
 * bullet, a full stop, a second line - and never more than eight words; an answer with a tag in it, or with nothing
 * left once cleaned, being no title at all; the request being bounded and kept out of the system prompt; and the
 * scripted model answering this call with a title the parser keeps.
 */
class ProjectTitlePromptsTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "Guestbook every visitor can sign|Guestbook every visitor can sign",
            "\"Guestbook every visitor can sign\"|Guestbook every visitor can sign",
            "Title: Kanban board for one person's tasks|Kanban board for one person's tasks",
            "**Pomodoro timer with break reminders**|Pomodoro timer with break reminders",
            "- recipe box for family dinners.|Recipe box for family dinners",
            "Project name: “Habit tracker”|Habit tracker",
    })
    @DisplayName("the answer is cleaned to the title itself")
    void cleansTheAnswer(String answer, String title) {
        assertThat(ProjectTitlePrompts.parse(answer)).isEqualTo(title);
    }

    @Test
    @DisplayName("only the first line is the title")
    void firstLineOnly() {
        assertThat(ProjectTitlePrompts.parse("\n\nShared grocery list for housemates\nThis app lets...")).isEqualTo("Shared grocery list for housemates");
    }

    @Test
    @DisplayName("a long answer is cut to eight words, without a dangling comma")
    void capsAtEightWords() {
        assertThat(ProjectTitlePrompts.parse("One two three four five six seven eight, nine ten eleven"))
                .isEqualTo("One two three four five six seven eight");
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"   ", "\"\"", "<script>alert(1)</script>", "Notes <b>app</b>", "-", "."})
    @DisplayName("an answer with no usable title in it is no title")
    void noTitle(String answer) {
        assertThat(ProjectTitlePrompts.parse(answer)).isNull();
    }

    @Test
    @DisplayName("the request is bounded, and the system prompt names neither it nor the build's write protocol")
    void requestIsBounded() {
        String block = ProjectTitlePrompts.block("x".repeat(5_000));
        assertThat(block).startsWith("What they asked for:\n").endsWith(" [...]");
        assertThat(block.length()).isLessThan(1_600);
        assertThat(ProjectTitlePrompts.systemPrompt()).startsWith(ProjectTitlePrompts.TITLE_PROMPT_OPENING)
                .doesNotContain("<file>").doesNotContain("<edit>");
    }

    @Test
    @DisplayName("the scripted model answers this call with a title the parser keeps")
    void stubAnswersWithATitle() {
        assertThat(StubReplies.callOf(ProjectTitlePrompts.systemPrompt())).isEqualTo(StubReplies.Call.TITLE);
        assertThat(ProjectTitlePrompts.parse(StubReplies.replyTo(StubReplies.Call.TITLE, "", ""))).isNotBlank();
    }
}
