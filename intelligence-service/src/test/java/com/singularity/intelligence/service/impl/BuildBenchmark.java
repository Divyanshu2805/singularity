package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.service.impl.TurnHarness.TurnResult;
import org.springframework.ai.chat.client.ChatClient;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Consumer;

/**
 * The fixed set of requests the build pipeline is measured with, and the report they produce.
 *
 * <p>Handles: reading the scenarios; running each as a whole build turn, with the scenarios of one chain sharing a
 * project and a conversation so a change is made to the app the chain's first build left; judging each turn against
 * what its kind of request should produce; and writing the results as JSON, the summary as a Markdown table, every
 * reply's raw text, and the project as each turn left it.
 *
 * <p>It exists so that a change to the prompt, the model or the turn engine is judged by what it does to twenty real
 * requests, not by whether one request someone tried by hand looked better. The numbers are per kind of request
 * because the kinds are different products: a first build is a minute of writing, a small change should be a few
 * seconds, and a request for another stack should cost almost nothing.
 *
 * <p>A turn counts as right when it ended the way its kind should - files saved for a build or a change, a question
 * and no files for another stack, words and no files for a question - and the server had nothing to add: no edit
 * that could not be applied, no file that does not parse, no import that does not resolve. That is what the pipeline
 * itself can know. Whether the app then compiles and starts is checked separately, on the project folders this
 * writes, by {@code scripts/bench-verify.sh}; this class never runs generated code.
 */
final class BuildBenchmark {

    enum Kind {
        FIRST_BUILD,
        CHANGE,
        QUESTION,
        OFF_STACK
    }

    record Scenario(String id, String chain, Kind kind, String prompt) {
    }

    record Measured(String id, String chain, Kind kind, TurnOutcome outcome, boolean right, String wrong,
                    long firstWordMillis, long firstFileMillis, long totalMillis, int calls, int promptTokens,
                    int completionTokens, int cachedTokens, int reasoningTokens, int filesTouched, int editsWritten,
                    int wholeFilesWritten, List<String> notices) {
    }

    record Prices(double inputPerMillion, double cachedPerMillion, double outputPerMillion) {

        boolean known() {
            return inputPerMillion > 0 || outputPerMillion > 0;
        }

        double costOf(long promptTokens, long cachedTokens, long completionTokens) {
            long uncached = Math.max(0, promptTokens - cachedTokens);
            double cachedPrice = cachedPerMillion > 0 ? cachedPerMillion : inputPerMillion;
            return (uncached * inputPerMillion + cachedTokens * cachedPrice + completionTokens * outputPerMillion)
                    / 1_000_000d;
        }
    }

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SCENARIOS = "/bench/scenarios.json";

    private final ChatClient chatClient;
    private final GenerationProperties properties;
    private final AiCallProperties callProperties;
    private final LlmResponseParser parser = new LlmResponseParser();

    BuildBenchmark(ChatClient chatClient, GenerationProperties properties, AiCallProperties callProperties) {
        this.chatClient = chatClient;
        this.properties = properties;
        this.callProperties = callProperties;
    }

    static List<Scenario> scenarios() {
        try (InputStream source = BuildBenchmark.class.getResourceAsStream(SCENARIOS)) {
            return List.of(JSON.readValue(source, Scenario[].class));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    List<Measured> run(List<Scenario> scenarios, Path out, Consumer<String> progress) {
        Map<String, TurnHarness> chains = new LinkedHashMap<>();
        List<Measured> results = new ArrayList<>();
        for (Scenario scenario : scenarios) {
            TurnHarness harness = chains.computeIfAbsent(scenario.chain(), chain -> new TurnHarness(chatClient,
                    ScratchProject.fromStarterTemplate(), properties, callProperties));
            TurnResult turn;
            try {
                turn = harness.send(scenario.prompt());
            } catch (RuntimeException failure) {
                progress.accept(scenario.id() + ": threw " + failure);
                results.add(new Measured(scenario.id(), scenario.chain(), scenario.kind(), TurnOutcome.FAILED, false,
                        "the turn threw: " + failure, -1, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, List.of()));
                continue;
            }
            Measured measured = measure(scenario, turn);
            results.add(measured);
            keep(out, scenario, turn, harness.project());
            progress.accept(String.format(Locale.ROOT, "%-22s %-13s %-5s first word %5.1fs  total %5.1fs  %d call(s)  %,d in / %,d out%s",
                    scenario.id(), measured.outcome(), measured.right() ? "ok" : "WRONG", measured.firstWordMillis() / 1000d,
                    measured.totalMillis() / 1000d, measured.calls(), measured.promptTokens(), measured.completionTokens(),
                    measured.right() ? "" : "  <- " + measured.wrong()));
        }
        return results;
    }

    Measured measure(Scenario scenario, TurnResult turn) {
        long edits = parser.parse(turn.text()).events().stream()
                .filter(event -> event.type() == ChatEventType.FILE_PATCH).count();
        long wholeFiles = parser.parse(turn.text()).events().stream()
                .filter(event -> event.type() == ChatEventType.FILE_EDIT).count();
        String wrong = wrongWith(scenario.kind(), turn);
        return new Measured(scenario.id(), scenario.chain(), scenario.kind(), turn.outcome(), wrong == null, wrong,
                turn.firstWordMillis(), turn.firstFileMillis(), turn.totalMillis(), turn.calls(), turn.promptTokens(),
                turn.completionTokens(), turn.cachedTokens(), turn.reasoningTokens(), turn.touched().size(),
                (int) edits, (int) wholeFiles, turn.notices());
    }

    static String wrongWith(Kind kind, TurnResult turn) {
        boolean wroteFiles = !turn.touched().isEmpty();
        return switch (kind) {
            case FIRST_BUILD, CHANGE -> {
                if (turn.outcome() != TurnOutcome.SAVED) yield "ended " + turn.outcome();
                if (!turn.notices().isEmpty()) yield "saved with a note: " + turn.notices().getFirst();
                if (turn.said().isEmpty()) yield "said nothing to the person";
                yield null;
            }
            case OFF_STACK -> {
                if (wroteFiles) yield "wrote files for a stack the workspace cannot run";
                if (turn.asked().isEmpty()) yield "did not ask whether to build it in React";
                yield turn.outcome() == TurnOutcome.ANSWERED ? null : "ended " + turn.outcome();
            }
            case QUESTION -> {
                if (wroteFiles) yield "changed files to answer a question";
                if (turn.said().isEmpty()) yield "said nothing";
                yield turn.outcome() == TurnOutcome.ANSWERED ? null : "ended " + turn.outcome();
            }
        };
    }

    private static void keep(Path out, Scenario scenario, TurnResult turn, ScratchProject project) {
        try {
            Path replies = Files.createDirectories(out.resolve("replies"));
            Files.writeString(replies.resolve(scenario.id() + ".txt"),
                    "REQUEST\n" + scenario.prompt() + "\n\nSTATUS LINES\n" + String.join("\n", turn.statuses())
                            + "\n\nNOTES\n" + String.join("\n", turn.notices())
                            + "\n\nUSAGE AS THE PROVIDER REPORTED IT, ONE LINE PER CALL\n"
                            + String.join("\n", turn.usageReports()) + "\n\nREPLY\n" + turn.text() + "\n",
                    StandardCharsets.UTF_8);
            if (turn.savedFiles() && !turn.touched().isEmpty()) {
                project.writeTo(Files.createDirectories(out.resolve("projects").resolve(scenario.id())));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static void write(Path out, String label, List<Measured> results, Prices prices) {
        try {
            Files.createDirectories(out);
            Files.writeString(out.resolve("results.json"),
                    JSON.writerWithDefaultPrettyPrinter().writeValueAsString(Map.of("label", label, "results", results)),
                    StandardCharsets.UTF_8);
            Files.writeString(out.resolve("report.md"), report(label, results, prices), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static String report(String label, List<Measured> results, Prices prices) {
        StringBuilder text = new StringBuilder("# Build benchmark: ").append(label).append("\n\n");
        text.append("| Kind | Runs | Right | First word (median) | First file (median) | Total (median) | Total (slowest) "
                + "| Calls per turn | Tokens in | Cached in | Tokens out |").append(prices.known() ? " Cost per turn |" : "")
                .append("\n|---|---|---|---|---|---|---|---|---|---|---|").append(prices.known() ? "---|" : "").append('\n');
        for (Kind kind : Kind.values()) {
            List<Measured> of = results.stream().filter(result -> result.kind() == kind).toList();
            if (!of.isEmpty()) {
                text.append(summaryRow(kind.name().toLowerCase(Locale.ROOT).replace('_', ' '), of, prices));
            }
        }
        text.append(summaryRow("**all**", results, prices));

        text.append("\n| Scenario | Outcome | Right | First word | First file | Total | Calls | In | Cached | Out | Files "
                + "| Edits / whole files | What was wrong |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n");
        for (Measured result : results) {
            text.append(String.format(Locale.ROOT, "| %s | %s | %s | %s | %s | %s | %d | %,d | %,d | %,d | %d | %d / %d | %s |%n",
                    result.id(), result.outcome(), result.right() ? "yes" : "**no**", seconds(result.firstWordMillis()),
                    seconds(result.firstFileMillis()), seconds(result.totalMillis()), result.calls(), result.promptTokens(),
                    result.cachedTokens(), result.completionTokens(), result.filesTouched(), result.editsWritten(),
                    result.wholeFilesWritten(), result.wrong() == null ? "" : result.wrong().replace("|", "/")));
        }
        return text.toString();
    }

    private static String summaryRow(String name, List<Measured> of, Prices prices) {
        long right = of.stream().filter(Measured::right).count();
        double in = of.stream().mapToInt(Measured::promptTokens).average().orElse(0);
        double cached = of.stream().mapToInt(Measured::cachedTokens).average().orElse(0);
        double outTokens = of.stream().mapToInt(Measured::completionTokens).average().orElse(0);
        String row = String.format(Locale.ROOT, "| %s | %d | %d (%d%%) | %s | %s | %s | %s | %.1f | %,.0f | %,.0f | %,.0f |",
                name, of.size(), right, Math.round(100d * right / of.size()),
                seconds(median(of.stream().map(Measured::firstWordMillis).filter(value -> value >= 0).toList())),
                seconds(median(of.stream().map(Measured::firstFileMillis).filter(value -> value >= 0).toList())),
                seconds(median(of.stream().map(Measured::totalMillis).toList())),
                seconds(of.stream().mapToLong(Measured::totalMillis).max().orElse(-1)),
                of.stream().mapToInt(Measured::calls).average().orElse(0), in, cached, outTokens);
        if (prices.known()) {
            row += String.format(Locale.ROOT, " $%.4f |", prices.costOf(Math.round(in), Math.round(cached), Math.round(outTokens)));
        }
        return row + "\n";
    }

    static long median(List<Long> values) {
        if (values.isEmpty()) {
            return -1;
        }
        List<Long> sorted = values.stream().sorted().toList();
        int middle = sorted.size() / 2;
        return sorted.size() % 2 == 1 ? sorted.get(middle) : (sorted.get(middle - 1) + sorted.get(middle)) / 2;
    }

    private static String seconds(long millis) {
        return millis < 0 ? "-" : String.format(Locale.ROOT, "%.1fs", millis / 1000d);
    }
}
