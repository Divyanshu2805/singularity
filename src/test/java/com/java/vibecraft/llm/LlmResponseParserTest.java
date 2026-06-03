package com.java.vibecraft.llm;

import com.java.vibecraft.entity.ChatEvent;
import com.java.vibecraft.entity.ChatMessage;
import com.java.vibecraft.enums.ChatEventType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Covers the build-checklist and teaching-mode lessons of the XML protocol - see PromptUtils for the tags themselves. */
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

    private static final String TIMER_WALKTHROUGH = """
            <summary>Keeps the countdown's numbers and the buttons that control it in one place.</summary>
            <part concept="Custom hooks"><code>export function useTimer(start: number) {</code>Your own reusable function starting with `use`.</part>
            <part concept="State"><code>const [left, setLeft] = useState(start);</code>Remembers how many seconds are left.</part>
            <part><code><button className="btn" onClick={() => setLeft(start)}></code>Puts the time back to the start.</part>
            <related path="src/App.tsx">shows the timer</related>""";

    @Test
    void parsesAWalkthroughAfterEachFileWithItsPathAndConcepts() {
        List<ChatEvent> events = parse("""
                <todo path="src/hooks/useTimer.ts">Building the timer logic</todo>
                <file path="src/hooks/useTimer.ts">export function useTimer(start: number) {}</file>
                <learn path="src/hooks/useTimer.ts">%s</learn>
                <file path="src/App.tsx">export default App;</file>
                <learn path="src/App.tsx"><summary>The app's top-level screen.</summary></learn>
                <message phase="completed">Done.</message>""".formatted(TIMER_WALKTHROUGH));

        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.TODO, ChatEventType.FILE_EDIT, ChatEventType.LEARN,
                ChatEventType.FILE_EDIT, ChatEventType.LEARN, ChatEventType.MESSAGE);

        ChatEvent lesson = events.get(2);
        // Saved as written: the client lays out the summary, parts and related files from the raw body.
        assertThat(lesson.getContent()).isEqualTo(TIMER_WALKTHROUGH);
        // The path is what puts the walkthrough under its file in the UI, so it has to survive verbatim.
        assertThat(lesson.getFilePath()).isEqualTo(events.get(1).getFilePath());
        // metadata holds the concepts it introduced - what later requests read back so they aren't re-explained.
        assertThat(lesson.getMetadata()).isEqualTo("Custom hooks, State");
        assertThat(events.get(4).getMetadata()).isNull();
        assertThat(events).extracting(ChatEvent::getSequenceOrder).containsExactly(1, 2, 3, 4, 5, 6);
    }

    @Test
    void codeFullOfTagsAndQuotesInsideAWalkthroughDoesNotCutItShort() {
        // JSX in a <code> anchor is full of angle brackets and quotes - none of it may end the <learn> early.
        List<ChatEvent> events = parse("""
                <file path="src/Timer.tsx">x</file><learn path="src/Timer.tsx">%s</learn><file path="src/App.tsx">y</file>"""
                .formatted(TIMER_WALKTHROUGH));

        assertThat(events).extracting(ChatEvent::getType)
                .containsExactly(ChatEventType.FILE_EDIT, ChatEventType.LEARN, ChatEventType.FILE_EDIT);
        assertThat(events.get(1).getContent()).endsWith("<related path=\"src/App.tsx\">shows the timer</related>");
    }

    @Test
    void collectsEachConceptOnceWithoutCommasThatWouldBreakTheList() {
        String concepts = LlmResponseParser.lessonConcepts(null, """
                <part concept="State"><code>a</code>x</part>
                <part><code>b</code>y</part>
                <part concept="state"><code>c</code>z</part>
                <part concept="Props, children"><code>d</code>w</part>""");

        assertThat(concepts).isEqualTo("State, Props children");
    }

    @Test
    void stillReadsTheConceptOfAOneSentenceLesson() {
        // Lessons saved before walkthroughs existed carried a single concept on the <learn> tag itself.
        assertThat(parse("<file path=\"a.tsx\">x</file><learn path=\"a.tsx\" concept=\"Props\">Props are inputs.</learn>"))
                .filteredOn(event -> event.getType() == ChatEventType.LEARN)
                .singleElement().satisfies(lesson -> assertThat(lesson.getMetadata()).isEqualTo("Props"));
    }

    @Test
    void countsAWalkthroughsParts() {
        assertThat(LlmResponseParser.lessonPartCount(TIMER_WALKTHROUGH)).isEqualTo(3);
        assertThat(LlmResponseParser.lessonPartCount("A plain sentence.")).isZero();
    }

    @Test
    void keepsOnlyTheFirstLessonForAFile() {
        List<ChatEvent> lessons = parse("""
                <file path="src/App.tsx">x</file>
                <learn path="src/App.tsx" concept="Props">First.</learn>
                <learn path="src/App.tsx" concept="JSX">Second.</learn>""").stream()
                .filter(event -> event.getType() == ChatEventType.LEARN).toList();

        assertThat(lessons).singleElement().satisfies(lesson -> assertThat(lesson.getContent()).isEqualTo("First."));
    }

    @Test
    void keepsALessonWithoutAConceptOrPath() {
        // Neither attribute is load-bearing for the text itself: the UI falls back to the file it follows.
        assertThat(parse("<file path=\"a.tsx\">x</file><learn>Components are reusable pieces of UI.</learn>"))
                .filteredOn(event -> event.getType() == ChatEventType.LEARN)
                .singleElement().satisfies(lesson -> {
                    assertThat(lesson.getContent()).isEqualTo("Components are reusable pieces of UI.");
                    assertThat(lesson.getFilePath()).isNull();
                    assertThat(lesson.getMetadata()).isNull();
                });
    }

    @Test
    void skipsAnEmptyLesson() {
        assertThat(parse("<file path=\"a.tsx\">x</file><learn path=\"a.tsx\" concept=\"Props\">  </learn>"))
                .extracting(ChatEvent::getType).containsExactly(ChatEventType.FILE_EDIT);
    }

    @Test
    void aLessonIsNeverMistakenForPartOfTheFileBeforeIt() {
        List<ChatEvent> events = parse("""
                <file path="src/App.tsx">const a = 1;</file><learn path="src/App.tsx" concept="Variables">A variable names a value.</learn>""");

        assertThat(events.getFirst().getContent()).isEqualTo("const a = 1;");
        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.FILE_EDIT, ChatEventType.LEARN);
    }
}
