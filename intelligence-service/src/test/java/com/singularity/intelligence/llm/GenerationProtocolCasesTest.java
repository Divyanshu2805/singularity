package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedTurn;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the build protocol's shared cases against the server's parser.
 *
 * <p>Handles: every case in {@code src/test/resources/protocol/cases.json} - the answer text, the events it must
 * become, where it was cut off and which paths were refused. The browser's parser runs the same file
 * ({@code frontend/src/lib/generation-protocol.test.ts}), which is the point: the two once disagreed about a file
 * containing {@code useState<Todo[]>}, so the chat showed a file as written that the server had thrown away. A new
 * rule goes into that file first, and both parsers have to satisfy it.
 */
class GenerationProtocolCasesTest {

    private final LlmResponseParser parser = new LlmResponseParser();

    static Stream<Arguments> cases() throws IOException {
        try (InputStream stream = GenerationProtocolCasesTest.class.getResourceAsStream("/protocol/cases.json")) {
            JsonNode root = JsonMapper.builder().build().readTree(stream);
            List<Arguments> cases = new ArrayList<>();
            root.forEach(testCase -> cases.add(Arguments.of(testCase.path("name").asString(), testCase)));
            return cases.stream();
        }
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void theAnswerBecomesExactlyTheEventsTheCaseNames(String name, JsonNode testCase) {
        ParsedTurn turn = parser.parse(testCase.path("input").asString());

        List<String> actual = turn.events().stream().map(GenerationProtocolCasesTest::describe).toList();
        List<String> expected = new ArrayList<>();
        testCase.path("events").forEach(event -> expected.add(describe(
                event.path("type").asString(), text(event, "path"), event.path("content").asString(), text(event, "metadata"))));
        assertThat(actual).as(name).containsExactlyElementsOf(expected);

        JsonNode cutOff = testCase.path("cutOff");
        if (cutOff.isMissingNode()) {
            assertThat(turn.endsMidBlock()).as("%s: not cut off", name).isFalse();
        } else {
            assertThat(turn.endsMidBlock()).as("%s: cut off", name).isTrue();
            assertThat(turn.cutOff().type().name()).isEqualTo(cutOff.path("type").asString());
            assertThat(turn.cutOff().path()).isEqualTo(text(cutOff, "path"));
        }

        List<String> rejected = new ArrayList<>();
        testCase.path("rejectedPaths").forEach(path -> rejected.add(path.asString()));
        assertThat(turn.rejectedPaths()).as("%s: refused paths", name).containsExactlyElementsOf(rejected);
    }

    private static String text(JsonNode node, String field) {
        return node.has(field) ? node.get(field).asString() : null;
    }

    private static String describe(ParsedEvent event) {
        return describe(event.type().name(), event.path(), event.content(), event.metadata());
    }

    private static String describe(String type, String path, String content, String metadata) {
        return type + " path=" + path + " metadata=" + metadata + " content=" + content;
    }
}
