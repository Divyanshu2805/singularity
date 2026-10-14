package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.stub.StubReplies;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the prompt for the titles of a person's chat messages and the reading of its answer.
 *
 * <p>Handles: the messages being numbered one line each, their "Build:" label dropped and each bounded, and kept out
 * of the system prompt; the numbered answer becoming one cleaned title per message, in order, at most eight words,
 * whatever order or wrapping the model used; a message skipped, repeated or answered with nothing usable having no
 * title; and the scripted model answering this call with a title for every message.
 */
class MessageTitlePromptsTest {

    @Test
    @DisplayName("each message is one numbered, bounded line, without its Build: label")
    void blockNumbersEachMessage() {
        String block = MessageTitlePrompts.block(List.of(
                "**Build:** A minimalist notes app\n\n**Details:**\n- Just me",
                "change name to Divyanshus notes",
                "x".repeat(2_000)));

        assertThat(block).startsWith("Their messages:\n")
                .contains("1. A minimalist notes app **Details:** - Just me\n")
                .contains("2. change name to Divyanshus notes\n")
                .endsWith(" [...]");
        assertThat(block.lines()).hasSize(4);
        assertThat(MessageTitlePrompts.systemPrompt()).startsWith(MessageTitlePrompts.MESSAGE_TITLE_PROMPT_OPENING)
                .doesNotContain("Divyanshus notes").doesNotContain("<file>");
    }

    @Test
    @DisplayName("the numbered answer becomes one cleaned title per message, in the messages' order")
    void parsesInOrder() {
        String answer = """
                Here are the titles:
                2) "Rename the app to Divyanshu's Notes".
                1. **Build a minimalist notes app**
                3. Title: Add a dark theme toggle with a switch in the corner of the header
                """;

        assertThat(MessageTitlePrompts.parse(answer, 3)).containsExactly(
                "Build a minimalist notes app",
                "Rename the app to Divyanshu's Notes",
                "Add a dark theme toggle with a switch");
    }

    @Test
    @DisplayName("a message the answer skipped, repeated past or gave nothing usable for has no title")
    void missingTitlesAreNull() {
        List<String> titles = MessageTitlePrompts.parse("1. Build a notes app\n1. Something else\n3. <b>x</b>\n9. Out of range", 3);

        assertThat(titles).containsExactly("Build a notes app", null, null);
        assertThat(MessageTitlePrompts.parse(null, 2)).containsExactly(null, null);
        assertThat(MessageTitlePrompts.parse("1. Anything", 0)).isEmpty();
    }

    @Test
    @DisplayName("the scripted model answers this call with a title for every message")
    void stubTitlesEveryMessage() {
        String request = MessageTitlePrompts.block(List.of("a notes app", "add a counter", "make it dark"));

        assertThat(StubReplies.callOf(MessageTitlePrompts.systemPrompt())).isEqualTo(StubReplies.Call.MESSAGE_TITLES);
        assertThat(MessageTitlePrompts.parse(StubReplies.replyTo(StubReplies.Call.MESSAGE_TITLES, "", request), 3))
                .hasSize(3).doesNotContainNull();
    }
}
