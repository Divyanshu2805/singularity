package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.stub.StubChatModel;
import com.singularity.intelligence.service.impl.BuildBenchmark.Kind;
import com.singularity.intelligence.service.impl.BuildBenchmark.Measured;
import com.singularity.intelligence.service.impl.BuildBenchmark.Prices;
import com.singularity.intelligence.service.impl.BuildBenchmark.Scenario;
import com.singularity.intelligence.service.impl.TurnHarness.TurnResult;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * Covers the benchmark itself, on the scripted model, so it costs nothing to keep working.
 *
 * <p>A benchmark that only ever runs against a paid model is broken the day someone needs it. These cases run its
 * whole path - scenarios, chains, judging, the files it leaves, the report - on the stub, and check the parts a wrong
 * number would come from: that a change is made to the project its chain's first build left, that each kind of
 * request is judged by its own rule, and that the shipped scenario file is one the runner can read and that every
 * change in it has a first build to stand on.
 */
class BuildBenchmarkTest {

    private final BuildBenchmark benchmark = new BuildBenchmark(
            ChatClient.builder(new StubChatModel(Duration.ZERO)).build(),
            GenerationProperties.defaults(), AiCallProperties.defaults());

    private static final List<Scenario> SCRIPTED = List.of(
            new Scenario("notes-build", "notes", Kind.FIRST_BUILD, "**Build:** A quick notes app."),
            new Scenario("notes-count", "notes", Kind.CHANGE, "show how many notes there are"),
            new Scenario("notes-question", "notes", Kind.QUESTION, "where are the notes kept?"),
            new Scenario("vue", "vue", Kind.OFF_STACK, "build it in Vue"));

    @Test
    void everyKindOfRequestIsRunJudgedAndWrittenUp(@TempDir Path out) throws Exception {
        List<Measured> results = benchmark.run(SCRIPTED, out, line -> { });
        BuildBenchmark.write(out, "stub", results, new Prices(1, 0.25, 4));

        assertThat(results).extracting(Measured::right).containsExactly(true, true, true, true);
        assertThat(results).extracting(Measured::outcome).containsExactly(
                TurnOutcome.SAVED, TurnOutcome.SAVED, TurnOutcome.ANSWERED, TurnOutcome.ANSWERED);
        assertThat(results.get(1).editsWritten()).isEqualTo(1);
        assertThat(results.get(1).wholeFilesWritten()).isEqualTo(1);

        assertThat(out.resolve("projects/notes-build/src/pages/Index.tsx")).exists();
        assertThat(Files.readString(out.resolve("projects/notes-count/src/pages/Index.tsx"))).contains("NoteCount");
        assertThat(out.resolve("projects/notes-question")).doesNotExist();
        assertThat(Files.readString(out.resolve("replies/vue.txt"))).contains("<ask");

        String report = Files.readString(out.resolve("report.md"));
        assertThat(report).contains("# Build benchmark: stub").contains("| first build | 1 | 1 (100%)")
                .contains("| **all** | 4 | 4 (100%)").contains("Cost per turn").contains("| notes-count | SAVED | yes |");
        assertThat(Files.readString(out.resolve("results.json"))).contains("\"label\"").contains("notes-build");
    }

    @Test
    void aBuildThatEndsWithAServerNoteIsNotCountedAsRight() {
        ParsedEvent said = new ParsedEvent(ChatEventType.MESSAGE, null, "Done.", null, 0, 5);
        ParsedEvent file = new ParsedEvent(ChatEventType.FILE_EDIT, "src/App.tsx", "export {};", null, 5, 9);
        TurnResult withANote = new TurnResult("add a page", TurnOutcome.SAVED, List.of(said, file),
                List.of("src/App.tsx imports ./pages/Missing, which does not exist."), "", List.of(), 0, 0, 0, 3, 0, 0, 0, 0, List.of());
        TurnResult clean = new TurnResult("add a page", TurnOutcome.SAVED, List.of(said, file), List.of(), "",
                List.of(), 0, 0, 0, 1, 0, 0, 0, 0, List.of());

        assertThat(BuildBenchmark.wrongWith(Kind.CHANGE, withANote)).startsWith("saved with a note");
        assertThat(BuildBenchmark.wrongWith(Kind.CHANGE, clean)).isNull();
        assertThat(BuildBenchmark.wrongWith(Kind.QUESTION, clean)).isEqualTo("changed files to answer a question");
        assertThat(BuildBenchmark.wrongWith(Kind.OFF_STACK, clean)).startsWith("wrote files");
    }

    @Test
    void theShippedScenariosAreReadableAndEveryChainStartsWithItsFirstBuild() {
        List<Scenario> scenarios = BuildBenchmark.scenarios();

        assertThat(scenarios).hasSizeGreaterThanOrEqualTo(20);
        assertThat(scenarios).extracting(Scenario::id).doesNotHaveDuplicates();
        assertThat(scenarios).allSatisfy(scenario -> assertThat(scenario.prompt()).isNotBlank());
        for (Scenario scenario : scenarios) {
            if (scenario.kind() == Kind.CHANGE || scenario.kind() == Kind.QUESTION) {
                Scenario first = scenarios.stream().filter(other -> other.chain().equals(scenario.chain()))
                        .findFirst().orElseThrow();
                assertThat(first.kind()).as("the first scenario of chain %s", scenario.chain()).isEqualTo(Kind.FIRST_BUILD);
            }
        }
    }

    @Test
    void theCostCountsCachedInputAtItsOwnPrice() {
        assertThat(new Prices(1, 0.25, 4).costOf(1_000_000, 400_000, 100_000)).isCloseTo(1.1, within(1e-9));
        assertThat(new Prices(1, 0, 4).costOf(1_000_000, 400_000, 0)).isEqualTo(1.0);
        assertThat(new Prices(0, 0, 0).known()).isFalse();
    }

    @Test
    void theMedianOfAnEvenNumberOfRunsIsTheMiddleOfTheTwoInTheMiddle() {
        assertThat(BuildBenchmark.median(List.of(4L, 1L, 3L, 2L))).isEqualTo(2);
        assertThat(BuildBenchmark.median(List.of(5L, 1L, 3L))).isEqualTo(3);
        assertThat(BuildBenchmark.median(List.of())).isEqualTo(-1);
    }
}
