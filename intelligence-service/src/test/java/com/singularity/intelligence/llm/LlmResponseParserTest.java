package com.singularity.intelligence.llm;

import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedTurn;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what the parser adds on top of the protocol's shared cases ({@link GenerationProtocolCasesTest}): the events
 * it hands to the database, where an answer was cut off, and the tidying of a file's content.
 *
 * <p>The regression that matters most is pinned here in the words of the answer that exposed it: a todo app's hook
 * file, containing {@code useState<Todo[]>}, was discarded whole on every attempt because the generic was read as the
 * start of a checklist step.
 */
class LlmResponseParserTest {

    private final LlmResponseParser parser = new LlmResponseParser();
    private final ChatMessage parentMessage = ChatMessage.builder().build();

    @Test
    void theTodoAppsHookFileIsWrittenEvenThoughItsGenericLooksLikeAChecklistTag() {
        String answer = """
                <message>The missing `useTodos` hook is the only blocker - creating it now.</message>
                <todo path="src/hooks/useTodos.ts">Creating the todos state hook</todo>
                <file path="src/hooks/useTodos.ts">import { useCallback, useEffect, useState } from "react";
                import type { Todo } from "../types/todo";

                export function useTodos() {
                  const [todos, setTodos] = useState<Todo[]>(() => []);
                  return { todos, setTodos };
                }
                </file>
                <message>Created the hook. The import should resolve now.</message>
                """;

        List<ChatEvent> events = parser.parseChatEvents(answer, parentMessage);

        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);
        assertThat(events.get(2).getFilePath()).isEqualTo("src/hooks/useTodos.ts");
        assertThat(events.get(2).getContent()).contains("useState<Todo[]>(() => [])").endsWith("}\n");
    }

    @Test
    void eventsAreNumberedInTheOrderTheyAppearStartingAtOne() {
        List<ChatEvent> events = parser.parseChatEvents(
                "<message>Plan.</message><file path=\"a.ts\">a</file><message>Done.</message>", parentMessage);

        assertThat(events).extracting(ChatEvent::getSequenceOrder).containsExactly(1, 2, 3);
        assertThat(events).allSatisfy(event -> assertThat(event.getChatMessage()).isSameAs(parentMessage));
    }

    @Test
    void anAnswerThatIsNullParsesAsEmptyRatherThanThrowing() {
        ParsedTurn turn = parser.parse(null);

        assertThat(turn.events()).isEmpty();
        assertThat(turn.endsMidBlock()).isFalse();
    }

    @Test
    void anUnclosedFileWithACompleteBlockAfterItIsNotWhereTheAnswerEnded() {
        ParsedTurn turn = parser.parse("<file path=\"a.ts\">never closed<message>Done.</message>");

        assertThat(turn.events()).extracting(event -> event.type()).containsExactly(ChatEventType.MESSAGE);
        assertThat(turn.cutOff()).isNotNull();
        assertThat(turn.endsMidBlock()).isFalse();
    }

    @Test
    void theWordsWrittenOutsideAnyBlockAreHandedBackBesideTheEvents() {
        ParsedTurn turn = parser.parse(
                "  Let me look at the hook.\n<tool args=\"a.ts\">Reading 1 file</tool>\nIt is only the hook.\n"
                        + "<message>Fixing it.</message> ");

        assertThat(turn.looseText()).isEqualTo("Let me look at the hook.\n\nIt is only the hook.");
        assertThat(parser.parse("<message>Nothing outside.</message>").looseText()).isEmpty();
        assertThat(parser.parse("An answer with no tags at all.").looseText()).isEqualTo("An answer with no tags at all.");
    }

    @Test
    void theLooseWordsCanBeAskedForByWhereTheySat() {
        String answer = "I will add a toggle.\n<todo path=\"a.ts\">Adding it</todo>\nHere it is:\n"
                + "<file path=\"a.ts\">export const a = 1;</file>\nAdded the toggle.";
        ParsedTurn turn = parser.parse(answer);
        int firstStep = turn.events().getFirst().start();
        int lastStep = turn.events().getLast().end();

        assertThat(turn.looseTextBetween(0, firstStep)).isEqualTo("I will add a toggle.");
        assertThat(turn.looseTextBetween(lastStep, answer.length())).isEqualTo("Added the toggle.");
        assertThat(turn.looseTextBetween(firstStep, lastStep)).isEqualTo("Here it is:");
        assertThat(turn.looseText()).isEqualTo("I will add a toggle.\n\nHere it is:\n\nAdded the toggle.");
    }

    @Test
    void aBlockTheAnswerStoppedInsideIsNotCountedAsLooseWords() {
        assertThat(parser.parse("Here it is: <file path=\"a.ts\">export const half").looseText()).isEqualTo("Here it is:");
        assertThat(parser.parse("<file path=\"a.ts\">never closed<message>Done.</message> bye").looseText()).isEqualTo("bye");
        assertThat(parser.parse("<file path=\"../x.ts\">refused, but a block</file>").looseText()).isEmpty();
    }

    @Test
    void eachEventRemembersWhereItSatInTheAnswer() {
        String answer = "<message>Plan.</message><file path=\"a.ts\">a</file>";

        ParsedTurn turn = parser.parse(answer);

        assertThat(answer.substring(turn.events().get(1).start(), turn.events().get(1).end()))
                .isEqualTo("<file path=\"a.ts\">a</file>");
    }

    @Test
    void aFilesFirstLineKeepsItsIndentationAndTheFileEndsWithOneLineBreak() {
        assertThat(LlmResponseParser.fileContent("\n\n  indented:\n    child\n\n\n")).isEqualTo("  indented:\n    child\n");
        assertThat(LlmResponseParser.fileContent("no trailing newline")).isEqualTo("no trailing newline\n");
        assertThat(LlmResponseParser.fileContent("   \n \n")).isEmpty();
    }

    @Test
    void aLessonsConceptsComeFromItsTagAndItsParts() {
        List<ChatEvent> events = parser.parseChatEvents(
                "<learn path=\"a.tsx\" concept=\"Props\"><part concept=\"State\">x</part><part concept=\"props\">y</part></learn>",
                parentMessage);

        assertThat(events.getFirst().getMetadata()).isEqualTo("Props, State");
        assertThat(LlmResponseParser.lessonPartCount(events.getFirst().getContent())).isEqualTo(2);
    }
}
