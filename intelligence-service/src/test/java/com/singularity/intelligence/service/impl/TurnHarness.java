package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.AiCallKind;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.BuildModel;
import com.singularity.intelligence.llm.ConversationMemory;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.SyntaxCheck;
import com.singularity.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.BuildTurn.TurnRequest;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.api.OpenAiApi;
import reactor.core.publisher.Flux;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Runs whole build turns against a project held in memory, and reports what each one did and how long it took.
 *
 * <p>Handles: wiring the real turn - the prompt, the project description, the parser, the edit, syntax and import
 * checks, the repair loop - to a chat client and a {@link ScratchProject}; standing in for the three things a turn
 * touches outside itself (saving, metering, the workspace API); applying a finished turn's files to the project so
 * the next turn sees them; carrying the conversation between turns the way the service does; and timing the first
 * word, the first file and the whole turn.
 *
 * <p>Everything between the request and the saved result is the production code. Only the ends are replaced, which
 * is what lets the same harness prove the scripted model in an ordinary test and measure a real one in the
 * benchmark. The daily allowance is never the limit here: a benchmark that stopped at the allowance would measure the
 * allowance.
 */
final class TurnHarness {

    record TurnResult(String request, TurnOutcome outcome, List<ParsedEvent> events, List<String> notices,
                      String text, List<String> statuses, long firstWordMillis, long firstFileMillis,
                      long totalMillis, int calls, int promptTokens, int completionTokens, int cachedTokens,
                      int reasoningTokens, List<String> usageReports) {

        long count(ChatEventType type) {
            return events.stream().filter(event -> event.type() == type).count();
        }

        List<String> said() {
            return events.stream().filter(event -> event.type() == ChatEventType.MESSAGE)
                    .map(ParsedEvent::content).toList();
        }

        List<String> asked() {
            return events.stream().filter(event -> event.type() == ChatEventType.ASK)
                    .map(ParsedEvent::content).toList();
        }

        List<String> touched() {
            return events.stream().filter(ParsedEvent::replacesTheFile).map(ParsedEvent::path).distinct().toList();
        }

        boolean savedFiles() {
            return outcome == TurnOutcome.SAVED || outcome == TurnOutcome.INCOMPLETE || outcome == TurnOutcome.OUT_OF_BUDGET;
        }
    }

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;

    private final ScratchProject project;
    private final BuildTurn buildTurn;
    private final GenerationRegistry registry = new GenerationRegistry(Clock.systemUTC());
    private final ChatSession chatSession = ChatSession.builder().id(new ChatSessionId(PROJECT_ID, USER_ID)).build();
    private final List<ConversationMemory.Turn> conversation = new ArrayList<>();
    private final AtomicReference<TurnRecord> recorded = new AtomicReference<>();
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicInteger cachedTokens = new AtomicInteger();
    private final AtomicInteger reasoningTokens = new AtomicInteger();
    private final List<String> usageReports = new java.util.concurrent.CopyOnWriteArrayList<>();

    TurnHarness(ChatClient chatClient, ScratchProject project, GenerationProperties properties,
                AiCallProperties callProperties) {
        this.project = project;

        WorkspaceServiceClient workspace = mock(WorkspaceServiceClient.class);
        when(workspace.getFileTree(anyLong())).thenAnswer(call -> project.getFileTree(call.getArgument(0)));
        when(workspace.getFileContent(anyLong(), anyString()))
                .thenAnswer(call -> project.getFileContent(call.getArgument(0), call.getArgument(1)));

        BuildModel buildModel = new BuildModel(chatClient, new FileTreeContextAdvisor(workspace),
                new ModelCalls(callProperties)) {
            @Override
            public Flux<ChatResponse> stream(List<Message> messages, CodeGenerationTools tools, ProjectBrief brief,
                                             AiCallKind kind) {
                AtomicReference<Usage> last = new AtomicReference<>();
                return Flux.defer(() -> {
                    calls.incrementAndGet();
                    return super.stream(messages, tools, brief, kind);
                }).doOnNext(response -> {
                    if (response.getMetadata() != null && response.getMetadata().getUsage() != null) {
                        last.set(response.getMetadata().getUsage());
                    }
                }).doFinally(signal -> countDetails(last.get()));
            }
        };

        TurnRecorder recorder = mock(TurnRecorder.class);
        when(recorder.record(any())).thenAnswer(call -> {
            TurnRecord record = call.getArgument(0);
            recorded.set(record);
            if (record.outcome() != null) return record.outcome();
            return record.events().stream().anyMatch(ParsedEvent::isFileChange) ? TurnOutcome.SAVED : TurnOutcome.ANSWERED;
        });
        UsageService usage = mock(UsageService.class);

        this.buildTurn = new BuildTurn(buildModel, new LlmResponseParser(), project, recorder,
                mock(AiUsageRecorder.class), usage, registry, properties, Clock.systemUTC(), new SyntaxCheck(),
                (projectId, written, deleted) -> CodeCheckResponse.skipped("There is no preview in a test."));
    }

    private void countDetails(Usage usage) {
        usageReports.add(usage == null ? "(no usage report)" : String.valueOf(usage.getNativeUsage()));
        if (usage == null || !(usage.getNativeUsage() instanceof OpenAiApi.Usage details)) {
            return;
        }
        if (details.promptTokensDetails() != null && details.promptTokensDetails().cachedTokens() != null) {
            cachedTokens.addAndGet(details.promptTokensDetails().cachedTokens());
        }
        if (details.completionTokenDetails() != null && details.completionTokenDetails().reasoningTokens() != null) {
            reasoningTokens.addAndGet(details.completionTokenDetails().reasoningTokens());
        }
    }

    ScratchProject project() {
        return project;
    }

    TurnResult send(String request) {
        recorded.set(null);
        calls.set(0);
        cachedTokens.set(0);
        reasoningTokens.set(0);
        usageReports.clear();

        ActiveGeneration generation = registry.start(PROJECT_ID, USER_ID, request);
        generation.setReservation(new UsageReservation(USER_ID, LocalDate.now(), Integer.MAX_VALUE));
        long started = System.nanoTime();
        AtomicLong firstWord = new AtomicLong(-1);
        AtomicLong firstFile = new AtomicLong(-1);
        StringBuilder text = new StringBuilder();
        List<String> statuses = new ArrayList<>();
        generation.watch().subscribe(signal -> {
            long elapsed = (System.nanoTime() - started) / 1_000_000;
            if (signal.kind() == GenerationSignal.Kind.STATUS) {
                statuses.add(signal.text());
            } else if (signal.kind() == GenerationSignal.Kind.REPLACE) {
                text.setLength(0);
                text.append(signal.text());
            } else if (signal.kind() == GenerationSignal.Kind.TEXT) {
                text.append(signal.text());
                if (!signal.text().isBlank()) {
                    firstWord.compareAndSet(-1, elapsed);
                }
                if (firstFile.get() < 0 && (text.indexOf("<file ") >= 0 || text.indexOf("<edit ") >= 0)) {
                    firstFile.set(elapsed);
                }
            }
        }, error -> { });

        buildTurn.run(new TurnRequest(PROJECT_ID, USER_ID, request, chatSession,
                ConversationMemory.replay(conversation), false), generation);
        long total = (System.nanoTime() - started) / 1_000_000;

        TurnRecord record = recorded.get();
        if (record == null) {
            return new TurnResult(request, TurnOutcome.FAILED, List.of(), List.of("The turn was never handed over to be saved."),
                    text.toString(), statuses, firstWord.get(), firstFile.get(), total, calls.get(), 0, 0, 0, 0,
                    List.copyOf(usageReports));
        }
        TurnOutcome outcome = record.outcome() != null ? record.outcome()
                : record.events().stream().anyMatch(ParsedEvent::isFileChange) ? TurnOutcome.SAVED : TurnOutcome.ANSWERED;
        TurnResult result = new TurnResult(request, outcome, record.events(), record.notices(), text.toString(),
                statuses, firstWord.get(), firstFile.get(), total, calls.get(),
                record.promptTokens() == null ? 0 : record.promptTokens(),
                record.completionTokens() == null ? 0 : record.completionTokens(),
                cachedTokens.get(), reasoningTokens.get(), List.copyOf(usageReports));

        if (result.savedFiles()) {
            project.apply(record.events());
        }
        conversation.add(ConversationMemory.Turn.request(request));
        conversation.add(ConversationMemory.Turn.reply(String.join(" ", result.said()),
                record.events().stream().filter(event -> event.type() == ChatEventType.THINKING)
                        .map(ParsedEvent::content).toList(),
                result.asked(), result.savedFiles() ? result.touched() : List.of()));
        return result;
    }
}
