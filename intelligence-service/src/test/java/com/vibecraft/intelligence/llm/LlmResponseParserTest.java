package com.vibecraft.intelligence.llm;

import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.enums.ChatEventType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers CODE_REVIEW.md AI-07 and AI-08. AI-07: no-tag, empty, and truncated model output must degrade to an empty
 * or partial event list rather than crash finalization - there is no fixed-index access into a possibly-empty list
 * anywhere in this class today, but that is exactly the kind of thing a refactor could reintroduce silently, so it is
 * pinned here. AI-08: a tag's content must survive a literal occurrence of its own closing tag inside it (the model
 * documenting this very protocol, or an example), and a file the model re-outputs mid-turn must not leave a phantom
 * duplicate entry in the transcript alongside the one that is actually saved.
 */
class LlmResponseParserTest {

    private final LlmResponseParser parser = new LlmResponseParser();
    private final ChatMessage parentMessage = ChatMessage.builder().build();

    private List<ChatEvent> parse(String response) {
        return parser.parseChatEvents(response, parentMessage);
    }

    @Test
    void emptyResponseProducesNoEvents() {
        assertThat(parse("")).isEmpty();
    }

    @Test
    void responseWithNoRecognizedTagsProducesNoEvents() {
        assertThat(parse("just some prose with no tags at all")).isEmpty();
    }

    @Test
    void aTruncatedFinalTagWithNoClosingTagProducesNoEventForItButDoesNotThrow() {
        List<ChatEvent> events = parse("<message>Planning the change.</message><file path=\"src/App.tsx\">partial content, cut off");

        assertThat(events).hasSize(1);
        assertThat(events.getFirst()).extracting(ChatEvent::getType, ChatEvent::getContent)
                .containsExactly(ChatEventType.MESSAGE, "Planning the change.");
    }

    @Test
    void parsesOneOfEachTagWithItsAttributesInOrder() {
        String response = """
                <message>Plan.</message>
                <todo path="src/App.tsx">Wiring up the route</todo>
                <tool args="src/App.tsx">Reading App.tsx</tool>
                <file path="src/App.tsx">export const App = () => null;</file>
                <delete path="src/Old.tsx">No longer needed</delete>
                <learn path="src/App.tsx" concept="Routing">This wires up the route.</learn>
                """;

        List<ChatEvent> events = parse(response);

        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.TOOL_LOG,
                ChatEventType.FILE_EDIT, ChatEventType.FILE_DELETE, ChatEventType.LEARN);
        assertThat(events.get(3).getFilePath()).isEqualTo("src/App.tsx");
        assertThat(events.get(3).getContent()).isEqualTo("export const App = () => null;");
        assertThat(events.get(5).getMetadata()).isEqualTo("Routing");
    }

    @Test
    void tagNamesAreCaseInsensitive() {
        List<ChatEvent> events = parse("<MESSAGE>Hi</MESSAGE><File path=\"a.tsx\">content</File>");

        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.MESSAGE, ChatEventType.FILE_EDIT);
    }

    @Test
    void aFileContainingItsOwnLiteralClosingTagIsNotCutShort() {
        // The embedded `</file>` here is a bare closing tag with no matching fake opening tag alongside it - the
        // case this fix actually closes. An embedded literal *opening* tag can still confuse the boundary (see this
        // class's own header comment on the documented residual limitation) and is deliberately not exercised here.
        String response = "<file path=\"docs/Protocol.md\">A generated file always ends with a literal `</file>` "
                + "tag on its own line.</file><message>Done.</message>";

        List<ChatEvent> events = parse(response);

        assertThat(events).hasSize(2);
        assertThat(events.getFirst().getType()).isEqualTo(ChatEventType.FILE_EDIT);
        assertThat(events.getFirst().getContent())
                .isEqualTo("A generated file always ends with a literal `</file>` tag on its own line.");
        assertThat(events.get(1)).extracting(ChatEvent::getType, ChatEvent::getContent)
                .containsExactly(ChatEventType.MESSAGE, "Done.");
    }

    @Test
    void aDeleteReasonContainingALiteralClosingTagIsNotCutShort() {
        String response = "<delete path=\"a.tsx\">replaced, see `</delete>` in the docs</delete>";

        List<ChatEvent> events = parse(response);

        assertThat(events).hasSize(1);
        assertThat(events.getFirst().getContent()).isEqualTo("replaced, see `</delete>` in the docs");
    }

    @Test
    void reOutputtingTheSameFileKeepsOnlyTheLastVersion() {
        String response = "<file path=\"src/App.tsx\">first draft</file>"
                + "<message>Fixing a typo.</message>"
                + "<file path=\"src/App.tsx\">final version</file>";

        List<ChatEvent> events = parse(response);

        List<ChatEvent> fileEdits = events.stream().filter(e -> e.getType() == ChatEventType.FILE_EDIT).toList();
        assertThat(fileEdits).hasSize(1);
        assertThat(fileEdits.getFirst().getContent()).isEqualTo("final version");
        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.MESSAGE, ChatEventType.FILE_EDIT);
    }

    @Test
    void reOutputtingDifferentFilesIsNotTreatedAsADuplicate() {
        String response = "<file path=\"a.tsx\">a</file><file path=\"b.tsx\">b</file>";

        List<ChatEvent> events = parse(response);

        assertThat(events).hasSize(2);
        assertThat(events).extracting(ChatEvent::getFilePath).containsExactly("a.tsx", "b.tsx");
    }

    @Test
    void aSecondLearnForTheSamePathIsDroppedButForADifferentPathIsKept() {
        String response = "<learn path=\"a.tsx\">first</learn><learn path=\"a.tsx\">second</learn><learn path=\"b.tsx\">third</learn>";

        List<ChatEvent> events = parse(response);

        assertThat(events).hasSize(2);
        assertThat(events).extracting(ChatEvent::getContent).containsExactly("first", "third");
    }

    @Test
    void aTagWithNoPathAttributeIsSkippedForFileAndDelete() {
        List<ChatEvent> events = parse("<file>no path</file><delete>no path either</delete><message>still here</message>");

        assertThat(events).hasSize(1);
        assertThat(events.getFirst().getType()).isEqualTo(ChatEventType.MESSAGE);
    }

    @Test
    void checklistStepsBeyondTheCapAreDropped() {
        StringBuilder response = new StringBuilder();
        for (int i = 1; i <= 15; i++) {
            response.append("<todo path=\"f").append(i).append(".tsx\">step ").append(i).append("</todo>");
        }

        List<ChatEvent> events = parse(response.toString());

        assertThat(events).hasSize(12);
    }
}
