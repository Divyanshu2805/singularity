package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.ConversationMemory.Turn;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what a build turn is told about the conversation before it.
 *
 * <p>The point of the class is that a long conversation costs no more to continue than a short one, without losing
 * the two things the project's files cannot say: what the project was started as, and which choices were made on
 * purpose. So the cases are a conversation of forty exchanges staying inside the size limit, the founding exchange
 * surviving it, a request of sixteen thousand characters being shortened, and the decisions of recent turns being
 * carried while older ones are not.
 */
class ConversationMemoryTest {

    private static Turn reply(String said, String... decisions) {
        return Turn.reply(said, List.of(decisions), List.of(), List.of("src/pages/Index.tsx"));
    }

    private static int size(List<Message> history) {
        return history.stream().mapToInt(message -> message.getText().length()).sum();
    }

    @Test
    void aShortConversationIsReplayedWhole() {
        List<Message> history = ConversationMemory.replay(List.of(
                Turn.request("build a todo app"),
                reply("Tasks are in place.", "Tasks live in localStorage behind one hook."),
                Turn.request("add a dark theme")));

        assertThat(history).hasSize(3);
        assertThat(history.get(0)).isInstanceOf(UserMessage.class);
        assertThat(history.get(1)).isInstanceOf(AssistantMessage.class);
        assertThat(history.get(1).getText())
                .startsWith("Tasks are in place.")
                .contains("(Decisions made in that turn: Tasks live in localStorage behind one hook.)")
                .endsWith("(Files touched: src/pages/Index.tsx)");
        assertThat(history.get(2).getText()).isEqualTo("add a dark theme");
    }

    @Test
    void theThirtiethTurnIsSentNoMoreHistoryThanTheLimitAllows() {
        List<Turn> turns = new ArrayList<>();
        for (int exchange = 0; exchange < 40; exchange++) {
            turns.add(Turn.request("request " + exchange + " " + "x".repeat(3_000)));
            turns.add(reply("done " + exchange + " " + "y".repeat(2_000), "decision " + exchange));
        }

        List<Message> history = ConversationMemory.replay(turns);

        int foundingAllowance = ConversationMemory.MAX_REQUEST_CHARS + ConversationMemory.MAX_SAID_CHARS
                + ConversationMemory.MAX_DECISION_CHARS + 400;
        assertThat(size(history)).isLessThanOrEqualTo(ConversationMemory.MAX_CHARS + foundingAllowance);
        assertThat(history.getLast().getText()).startsWith("done 39");
    }

    @Test
    void theExchangeTheProjectWasStartedFromIsKeptHoweverLongAgoItWas() {
        List<Turn> turns = new ArrayList<>();
        turns.add(Turn.request("**Build:** a recipe box"));
        turns.add(reply("The recipe list is in place.", "Recipes are cards, not a table."));
        for (int exchange = 0; exchange < 20; exchange++) {
            turns.add(Turn.request("tweak " + exchange));
            turns.add(reply("tweaked " + exchange));
        }

        List<Message> history = ConversationMemory.replay(turns);

        assertThat(history.get(0).getText()).isEqualTo("**Build:** a recipe box");
        assertThat(history.get(1).getText())
                .contains("Recipes are cards, not a table.")
                .contains("later requests are not shown here");
        assertThat(history.get(2).getText()).startsWith("tweak ");
        assertThat(history.getLast().getText()).startsWith("tweaked 19");
    }

    @Test
    void aVeryLongRequestIsShortened() {
        List<Message> history = ConversationMemory.replay(List.of(Turn.request("a".repeat(16_000))));

        assertThat(history.getFirst().getText().length()).isLessThan(ConversationMemory.MAX_REQUEST_CHARS + 10);
        assertThat(history.getFirst().getText()).endsWith("[...]");
    }

    @Test
    void onlyTheMostRecentRepliesCarryTheirDecisions() {
        List<Turn> turns = new ArrayList<>();
        for (int exchange = 0; exchange < 5; exchange++) {
            turns.add(Turn.request("request " + exchange));
            turns.add(reply("done " + exchange, "decision " + exchange));
        }

        List<Message> history = ConversationMemory.replay(turns);

        assertThat(history.get(1).getText()).doesNotContain("decision 0");
        assertThat(history.get(3).getText()).doesNotContain("decision 1");
        assertThat(history.get(5).getText()).contains("decision 2");
        assertThat(history.get(9).getText()).contains("decision 4");
    }

    @Test
    void aQuestionIsReplayedWithItsTurn() {
        List<Message> history = ConversationMemory.replay(List.of(
                Turn.request("add accounts"),
                Turn.reply("I need one thing first.", List.of(), List.of("How should people sign in?"), List.of()),
                Turn.request("Google sign-in only")));

        assertThat(history.get(1).getText())
                .contains("You asked the user: How should people sign in? - their next message is the answer.");
    }

    @Test
    void aReplyWithNothingWorthReplayingIsLeftOut() {
        List<Message> history = ConversationMemory.replay(List.of(
                Turn.request("hello"), Turn.reply("", List.of(), List.of(), List.of())));

        assertThat(history).hasSize(1);
    }

    @Test
    void anEmptyConversationHasNoHistory() {
        assertThat(ConversationMemory.replay(List.of())).isEmpty();
        assertThat(ConversationMemory.replay(null)).isEmpty();
    }
}
