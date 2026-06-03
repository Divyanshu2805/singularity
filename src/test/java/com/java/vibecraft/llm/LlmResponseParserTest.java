package com.java.vibecraft.llm;

import com.java.vibecraft.entity.ChatEvent;
import com.java.vibecraft.entity.ChatMessage;
import com.java.vibecraft.enums.ChatEventType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Covers the build-checklist part of the XML protocol - see PromptUtils for the tags themselves. */
class LlmResponseParserTest {

    private final LlmResponseParser parser = new LlmResponseParser();
    private final ChatMessage parent = new ChatMessage();

    private List<ChatEvent> parse(String response) {
        return parser.parseChatEvents(response, parent);
    }

    @Test
    void parsesChecklistStepsAlongsideTheOtherTags() {
        List<ChatEvent> events = parse("""
                <message phase="planning">I'll add a navbar and wire the routes.</message>
                <todo path="src/components/Navbar.tsx">Creating the navigation bar</todo>
                <todo path="src/App.tsx">Wiring up the routes</todo>
                <file path="src/components/Navbar.tsx">export const Navbar = () => null;</file>
                <file path="src/App.tsx">export default App;</file>
                <message phase="completed">Done.</message>""");

        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.TODO,
                ChatEventType.FILE_EDIT, ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);

        ChatEvent firstStep = events.get(1);
        assertThat(firstStep.getContent()).isEqualTo("Creating the navigation bar");
        // The path is what ties a step to the file edit that ticks it off, so it has to survive verbatim.
        assertThat(firstStep.getFilePath()).isEqualTo("src/components/Navbar.tsx");
        assertThat(events.get(3).getFilePath()).isEqualTo(firstStep.getFilePath());
    }

    @Test
    void keepsAStepThatNamesNoFile() {
        List<ChatEvent> events = parse("<todo>Sketching the layout</todo>");

        assertThat(events).singleElement().satisfies(event -> {
            assertThat(event.getType()).isEqualTo(ChatEventType.TODO);
            assertThat(event.getContent()).isEqualTo("Sketching the layout");
            assertThat(event.getFilePath()).isNull();
        });
    }

    @Test
    void skipsAnEmptyStepRatherThanShowingABlankChecklistRow() {
        assertThat(parse("<todo path=\"src/App.tsx\">   </todo><message>Hi</message>"))
                .extracting(ChatEvent::getType).containsExactly(ChatEventType.MESSAGE);
    }

    @Test
    void numbersEveryEventInTheOrderItWasWritten() {
        List<ChatEvent> events = parse("""
                <todo path="a.tsx">One</todo>
                <todo path="b.tsx">Two</todo>
                <file path="a.tsx">x</file>""");

        assertThat(events).extracting(ChatEvent::getSequenceOrder).containsExactly(1, 2, 3);
    }

    @Test
    void lengthFollowsTheWorkRatherThanAFixedNumber() {
        // A one-file change is one step, and a five-file change is five - nothing normalises toward a target.
        assertThat(parse("<todo path=\"a.tsx\">One</todo><file path=\"a.tsx\">x</file>"))
                .filteredOn(event -> event.getType() == ChatEventType.TODO).hasSize(1);

        String fiveSteps = """
                <todo path="a.tsx">One</todo><todo path="b.tsx">Two</todo><todo path="c.tsx">Three</todo>
                <todo path="d.tsx">Four</todo><todo path="e.tsx">Five</todo>""";
        assertThat(parse(fiveSteps))
                .filteredOn(event -> event.getType() == ChatEventType.TODO).hasSize(5);
    }

    @Test
    void capsARunawayChecklistWithoutTouchingAReasonableOne() {
        StringBuilder runaway = new StringBuilder();
        for (int step = 1; step <= 30; step++) {
            runaway.append("<todo path=\"file%d.tsx\">Step %d</todo>".formatted(step, step));
        }

        List<ChatEvent> steps = parse(runaway.toString()).stream()
                .filter(event -> event.getType() == ChatEventType.TODO).toList();

        assertThat(steps).hasSize(12);
        // The steps that survive are the first ones, so the checklist still starts where the model started.
        assertThat(steps.getFirst().getContent()).isEqualTo("Step 1");
        assertThat(steps.getLast().getContent()).isEqualTo("Step 12");
    }

    @Test
    void keepsStepsTheModelNeverDelivered() {
        // Announcing three files and writing one is an unfinished plan, and the extra steps are how that
        // shows up in the UI - the cap must not quietly trim the checklist down to the files delivered.
        List<ChatEvent> events = parse("""
                <todo path="a.tsx">One</todo>
                <todo path="b.tsx">Two</todo>
                <todo path="c.tsx">Three</todo>
                <file path="a.tsx">x</file>""");

        assertThat(events).filteredOn(event -> event.getType() == ChatEventType.TODO).hasSize(3);
        assertThat(events).filteredOn(event -> event.getType() == ChatEventType.FILE_EDIT).hasSize(1);
    }

    @Test
    void stillParsesAResponseWithNoChecklistAtAll() {
        List<ChatEvent> events = parse("<message>Just answering a question.</message>");

        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.MESSAGE);
    }
}
