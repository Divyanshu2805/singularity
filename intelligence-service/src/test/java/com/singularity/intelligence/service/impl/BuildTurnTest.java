package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.common.dto.FileContentDto;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.chat.GenerationSignal.Kind;
import com.singularity.intelligence.dto.usage.UsageRecord;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.BuildModel;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.SyntaxCheck;
import com.singularity.intelligence.llm.PromptUtils;
import com.singularity.intelligence.llm.TurnReview;
import com.singularity.intelligence.llm.tools.CodeGenerationTools;
import com.singularity.intelligence.service.CodeChecker;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
import com.singularity.intelligence.service.impl.BuildTurn.TurnRequest;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.metadata.ChatResponseMetadata;
import org.springframework.ai.chat.metadata.DefaultUsage;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.http.HttpHeaders;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers a build turn from the model's first word to what is handed over to be saved.
 *
 * <p>Each case is a way a real turn has gone: the reply stopped a file short of its plan (the todo app that ended up
 * importing a hook nobody wrote); it was cut off mid-file; nothing came back; the provider was busy, refused, or went
 * silent - which once left a project locked as "generating" for good; the files it wrote import something that does
 * not exist; it changed part of a file, with text that was or was not in it; it wrote a file that does not parse;
 * the compiler, checking the files in the project's preview, found a type error or a package that does not exist;
 * someone pressed stop. In every one the turn must end, be handed to the recorder exactly once, leave the
 * registry, and tell its viewers how it ended.
 *
 * <p>The model is a stub that returns one prepared stream per call, so nothing here costs a token.
 */
class BuildTurnTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;

    private static final String PLAN = """
            <message>I'll build the todo app.</message>
            <todo path="src/types/todo.ts">Defining the todo type</todo>
            <todo path="src/hooks/useTodos.ts">Building the todo state hook</todo>
            """;
    private static final String TYPE_FILE = "<file path=\"src/types/todo.ts\">export type Todo = { id: string };</file>";
    private static final String HOOK_FILE =
            "<file path=\"src/hooks/useTodos.ts\">import type { Todo } from \"../types/todo\";\n"
                    + "export const useTodos = (): Todo[] => [];</file>";

    private static final SyntaxCheck SYNTAX_CHECK = new SyntaxCheck();
    private static final String INDEX_PAGE = """
            export default function Index() {
              const title = "Hello";
              return (
                <main>
                  <h1>{title}</h1>
                </main>
              );
            }
            """;

    private final BuildModel buildModel = mock(BuildModel.class);
    private final ProjectFileReader projectFileReader = mock(ProjectFileReader.class);
    private final TurnRecorder recorder = mock(TurnRecorder.class);
    private final AiUsageRecorder aiUsageRecorder = mock(AiUsageRecorder.class);
    private final UsageService usageService = mock(UsageService.class);
    private final CodeChecker codeChecker = mock(CodeChecker.class);
    private final GenerationRegistry registry = new GenerationRegistry(Clock.systemUTC());

    private final ChatSession chatSession = ChatSession.builder().id(new ChatSessionId(PROJECT_ID, USER_ID)).build();
    private final TurnRequest request = new TurnRequest(PROJECT_ID, USER_ID, "build a todo app", chatSession,
            List.of());
    private final UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.now(), 60_000);
    private final ActiveGeneration generation = registry.start(PROJECT_ID, USER_ID, "build a todo app");
    private final List<GenerationSignal> signals = new CopyOnWriteArrayList<>();
    private final AtomicReference<TurnRecord> recorded = new AtomicReference<>();
    private final AtomicReference<Throwable> viewerError = new AtomicReference<>();

    BuildTurnTest() {
        generation.setReservation(reservation);
        generation.watch().subscribe(signals::add, viewerError::set);
        when(buildModel.describe(eq(PROJECT_ID), any())).thenReturn(ProjectBrief.empty());
        when(codeChecker.check(any(), any(), any())).thenReturn(CodeCheckResponse.skipped("No preview is running."));
        when(recorder.record(any())).thenAnswer(call -> {
            TurnRecord record = call.getArgument(0);
            recorded.set(record);
            if (record.outcome() != null) return record.outcome();
            return record.events().stream().anyMatch(ParsedEvent::isFileChange) ? TurnOutcome.SAVED : TurnOutcome.ANSWERED;
        });
        projectHas("package.json", "index.html", "src/main.tsx", "src/App.tsx", "src/pages/Index.tsx");
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any())).thenAnswer(call ->
                new FileContentDto(call.getArgument(1), "{ \"dependencies\": { \"react\": \"^18.3.1\" } }"));
    }

    private void projectHas(String... paths) {
        List<FileTreeDto.Entry> entries = new ArrayList<>();
        for (String path : paths) {
            entries.add(new FileTreeDto.Entry(path, 100, "text/plain"));
        }
        when(projectFileReader.getFileTree(PROJECT_ID)).thenReturn(new FileTreeDto(PROJECT_ID, entries));
    }

    private BuildTurn turn(GenerationProperties properties) {
        return new BuildTurn(buildModel, new LlmResponseParser(), projectFileReader, recorder, aiUsageRecorder,
                usageService, registry, properties, Clock.systemUTC(), SYNTAX_CHECK, codeChecker);
    }

    private void run() {
        turn(GenerationProperties.defaults()).run(request, generation);
    }

    private static GenerationProperties quick(Duration idleTimeout) {
        return new GenerationProperties(idleTimeout, Duration.ofSeconds(5), Duration.ofMinutes(2), Duration.ofMillis(5), 2, 1);
    }

    private static Flux<ChatResponse> answer(String text) {
        return answer(text, "stop", 1000, 200);
    }

    private static Flux<ChatResponse> answer(String text, String finishReason, int promptTokens, int completionTokens) {
        int half = text.length() / 2;
        ChatResponse first = new ChatResponse(List.of(new Generation(new AssistantMessage(text.substring(0, half)))));
        ChatResponse last = new ChatResponse(
                List.of(new Generation(new AssistantMessage(text.substring(half)),
                        ChatGenerationMetadata.builder().finishReason(finishReason).build())),
                ChatResponseMetadata.builder().usage(new DefaultUsage(promptTokens, completionTokens)).build());
        return Flux.just(first, last);
    }

    @SafeVarargs
    private void modelReturns(Flux<ChatResponse> first, Flux<ChatResponse>... more) {
        when(buildModel.stream(any(), any(), any(), any())).thenReturn(first, more);
    }

    @SuppressWarnings("unchecked")
    private List<List<Message>> conversations(int calls) {
        ArgumentCaptor<List<Message>> captor = ArgumentCaptor.forClass(List.class);
        verify(buildModel, times(calls)).stream(captor.capture(), any(), any(), any());
        return captor.getAllValues();
    }

    private List<ChatEventType> recordedTypes() {
        return recorded.get().events().stream().map(ParsedEvent::type).toList();
    }

    private List<String> statuses() {
        return signals.stream().filter(signal -> signal.kind() == Kind.STATUS).map(GenerationSignal::text).toList();
    }

    private static WebClientResponseException providerError(int status) {
        return WebClientResponseException.create(status, "provider", HttpHeaders.EMPTY, new byte[0], null);
    }

    @Test
    void aCompleteAnswerIsStreamedSavedOnceAndItsViewersAreToldHowItEnded() {
        modelReturns(answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        verify(recorder, times(1)).record(any());
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.TODO,
                ChatEventType.FILE_EDIT, ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);
        assertThat(recorded.get().userMessage()).isEqualTo("build a todo app");
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("SAVED"));
        assertThat(statuses()).containsExactly("Reading your project", "Thinking it through", "Checking the code before saving",
                "Saving your changes");
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        assertThat(generation.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void theWholeAnswerReachesViewersAsItIsWrittenBeforeTheOutcome() {
        String text = "<message>Routing lives in App.tsx.</message>";
        modelReturns(answer(text));

        run();

        String streamed = signals.stream().filter(signal -> signal.kind() == Kind.TEXT)
                .map(GenerationSignal::text).reduce("", String::concat);
        assertThat(streamed).isEqualTo(text);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("ANSWERED"));
    }

    @Test
    void aReplyThatStopsAFileShortOfItsPlanIsContinuedNotRepeated() {
        modelReturns(
                answer(PLAN + TYPE_FILE + "<message>Done. The app is ready.</message>"),
                answer(HOOK_FILE + "<message>Added the hook.</message>"));

        run();

        List<List<Message>> conversations = conversations(2);
        assertThat(conversations.get(0)).hasSize(1);
        List<Message> continuation = conversations.get(1);
        assertThat(continuation).hasSize(3);
        assertThat(continuation.get(0)).isInstanceOf(UserMessage.class);
        assertThat(continuation.get(1)).isInstanceOf(AssistantMessage.class);
        assertThat(continuation.get(1).getText()).endsWith(TYPE_FILE).doesNotContain("Done. The app is ready.");
        assertThat(continuation.get(2).getText()).contains("Still to write").contains("- src/hooks/useTodos.ts")
                .contains("do NOT output these again").contains("- src/types/todo.ts");

        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.TODO,
                ChatEventType.FILE_EDIT, ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(statuses()).contains("The reply stopped early - writing the 1 file still left");
        assertThat(signals).anySatisfy(signal -> {
            assertThat(signal.kind()).isEqualTo(Kind.REPLACE);
            assertThat(signal.text()).endsWith(TYPE_FILE);
        });
    }

    @Test
    void aReplyCutOffInsideAFileHasThatHalfDiscardedAndIsAskedForItAgain() {
        modelReturns(
                answer(PLAN + TYPE_FILE + "<file path=\"src/hooks/useTodos.ts\">export const useTod", "length", 900, 4000),
                answer(HOOK_FILE + "<message>Done.</message>"));

        run();

        List<Message> continuation = conversations(2).get(1);
        assertThat(continuation.get(1).getText()).endsWith(TYPE_FILE).doesNotContain("export const useTod");
        assertThat(continuation.get(2).getText()).contains("cut off part-way and discarded");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::path)
                .containsExactly("src/types/todo.ts", "src/hooks/useTodos.ts");
        assertThat(recorded.get().events()).filteredOn(event -> "src/hooks/useTodos.ts".equals(event.path()) && event.isFileChange())
                .singleElement().satisfies(event -> assertThat(event.content()).contains("useTodos = (): Todo[] => []"));
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("SAVED"));
    }

    @Test
    void aTurnStillUnfinishedAfterItsContinuationsKeepsWhatItWroteAndSaysSo() {
        modelReturns(
                answer(PLAN + TYPE_FILE + "<message>Done.</message>"),
                answer("<message>Still done.</message>"),
                answer("<message>Really done.</message>"));

        run();

        verify(buildModel, times(3)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.INCOMPLETE);
        assertThat(recorded.get().notices()).singleElement().asString()
                .startsWith("This answer stopped before it finished. 1 of 2 steps are done");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("INCOMPLETE"));
    }

    @Test
    void readingFilesAndThenAnsweringInWordsIsNotMistakenForAnAbandonedEdit() {
        when(buildModel.stream(any(), any(), any(), any())).thenAnswer(call -> {
            CodeGenerationTools tools = call.getArgument(1);
            tools.readFiles(List.of("src/App.tsx", "src/main.tsx"));
            return answer("<message>Routing is set up in App.tsx with two routes.</message>");
        });

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.TOOL_LOG, ChatEventType.MESSAGE);
        assertThat(recorded.get().events().getFirst().metadata()).isEqualTo("src/App.tsx,src/main.tsx");
        assertThat(statuses()).contains("Reading 2 files");
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("ANSWERED"));
    }

    @Test
    void aTurnThatAsksTheUserAQuestionIsCompleteWithNothingWritten() {
        modelReturns(answer("<message>One thing first.</message><ask options=\"A table|Cards\">How should orders be shown?</ask>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE, ChatEventType.ASK);
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void theModelIsSentTheRequestWithTheReplyShapeUnderItButTheTurnIsRecordedInThePersonsOwnWords() {
        modelReturns(answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        String sent = conversations(1).getFirst().getLast().getText();
        assertThat(sent).isEqualTo("build a todo app" + PromptUtils.replyShape());
        assertThat(recorded.get().userMessage()).isEqualTo("build a todo app");
    }

    @Test
    void aBackslashTheModelLeftAtTheEndOfALineOfCodeIsNotSavedIntoTheProject() {
        modelReturns(answer("<message>Adding the page.</message>"
                + "<file path=\"src/pages/Index.tsx\">export default function Index() {\\\n  return null;\n}</file>"
                + "<file path=\"src/notes.md\">kept as written\\\n</file><message>Done.</message>"));

        run();

        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::content)
                .containsExactly("export default function Index() {\n  return null;\n}\n", "kept as written\\\n");
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void aTurnThatBuildsAPartAndThenAsksSavesThatPartAndTheQuestion() {
        modelReturns(answer("<think>The list can be cards or a table.</think><message>Starting with the type.</message>"
                + "<todo path=\"src/types/todo.ts\">Defining the todo type</todo>" + TYPE_FILE
                + "<message>The type is in.</message><ask options=\"A table|Cards\">How should todos be shown?</ask>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.THINKING, ChatEventType.MESSAGE, ChatEventType.TODO,
                ChatEventType.FILE_EDIT, ChatEventType.MESSAGE, ChatEventType.ASK);
        assertThat(recorded.get().outcome()).isNull();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("SAVED"));
    }

    @Test
    void aReplyThatOnlyThoughtIsShownItsThinkingAndAskedForTheAnswerWhichKeepsTheThinking() {
        modelReturns(answer("<think>One page, no router.</think>"), answer("<message>Building the board now.</message>"));

        run();

        List<List<Message>> conversations = conversations(2);
        assertThat(conversations.get(1)).hasSize(3);
        assertThat(conversations.get(1).get(1).getText()).isEqualTo("<approach>One page, no router.</approach>");
        assertThat(conversations.get(1).get(2).getText()).isEqualTo(TurnReview.answerReminder());
        assertThat(recordedTypes()).containsExactly(ChatEventType.THINKING, ChatEventType.MESSAGE);
        assertThat(statuses()).contains("Thought it through but didn't answer - asking for the answer");
    }

    @Test
    void wordsWrittenOutsideAMessageAfterTheThinkingAreStillKeptAsTheOpening() {
        modelReturns(answer("<think>Types first.</think>\nStarting with the type.\n"
                + "<todo path=\"src/types/todo.ts\">Defining the todo type</todo>" + TYPE_FILE));

        run();

        assertThat(recordedTypes()).containsExactly(ChatEventType.THINKING, ChatEventType.MESSAGE, ChatEventType.TODO,
                ChatEventType.FILE_EDIT);
        assertThat(recorded.get().events().get(1).content()).isEqualTo("Starting with the type.");
    }

    @Test
    void anEmptyAnswerIsAskedForOnceMoreAndTheSecondOneIsUsed() {
        modelReturns(Flux.empty(), answer("<message>Building the board now.</message>"));

        run();

        List<List<Message>> conversations = conversations(2);
        assertThat(conversations.get(1)).hasSize(1);
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE);
        assertThat(statuses()).contains("No answer came back - trying again");
    }

    @Test
    void anAnswerThatStaysEmptyIsRecordedAsEmptyWithANoteInsteadOfLookingLikeASuccess() {
        modelReturns(Flux.empty(), Flux.empty());

        run();

        verify(buildModel, times(2)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.EMPTY);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.EMPTY_ANSWER_NOTICE);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("EMPTY"));
    }

    @Test
    void aModelThatGoesSilentIsAbandonedSoTheProjectIsNeverLeftLockedAsGenerating() {
        modelReturns(Flux.never(), Flux.never());

        turn(quick(Duration.ofMillis(60))).run(request, generation);

        verify(buildModel, times(2)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.TIMED_OUT_NOTICE);
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("FAILED"));
    }

    @Test
    void aModelThatGoesSilentPartWayIsContinuedFromWhatItHadWritten() {
        Flux<ChatResponse> stalls = Flux.concat(
                Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(PLAN + TYPE_FILE))))), Flux.never());
        modelReturns(stalls, answer(HOOK_FILE + "<message>Done.</message>"));

        turn(quick(Duration.ofMillis(60))).run(request, generation);

        assertThat(conversations(2).get(1).get(1).getText()).endsWith(TYPE_FILE);
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(2);
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void aProviderThatRefusesOurCredentialsFailsStraightAwayWithoutRetrying() {
        modelReturns(Flux.error(providerError(401)));

        turn(quick(Duration.ofSeconds(5))).run(request, generation);

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.REFUSED_NOTICE);
    }

    @Test
    void aBusyProviderIsWaitedForAndAskedAgain() {
        modelReturns(Flux.error(providerError(429)), answer("<message>Here you go.</message>"));

        turn(quick(Duration.ofSeconds(5))).run(request, generation);

        verify(buildModel, times(2)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE);
        assertThat(recorded.get().outcome()).isNull();
        assertThat(statuses()).contains("The AI provider is busy - trying again in a moment");
    }

    @Test
    void aProviderThatStaysBusyEndsTheTurnWithARateLimitNote() {
        when(buildModel.stream(any(), any(), any(), any())).thenAnswer(call -> Flux.error(providerError(429)));

        turn(quick(Duration.ofSeconds(5))).run(request, generation);

        verify(buildModel, times(1 + BuildTurn.MAX_BUSY_RETRIES)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.RATE_LIMITED_NOTICE);
    }

    @Test
    void anImportOfAFileNobodyWroteIsRepairedBeforeTheTurnIsSaved() {
        String page = "<file path=\"src/pages/Index.tsx\">import { useTodos } from \"../hooks/useTodos\";\n"
                + "export default function Index() { useTodos(); return null; }</file>";
        modelReturns(
                answer("<message>Wiring the page.</message>" + page + "<message>Done.</message>"),
                answer(HOOK_FILE.replace("import type { Todo } from \"../types/todo\";\n", "").replace("(): Todo[]", "()")
                        + "<message>Added the missing hook.</message>"));

        run();

        List<Message> repair = conversations(2).get(1);
        assertThat(repair).hasSize(3);
        assertThat(repair.get(2).getText())
                .contains("`src/pages/Index.tsx` imports \"../hooks/useTodos\", but no such file exists");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::path)
                .containsExactly("src/pages/Index.tsx", "src/hooks/useTodos.ts");
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(statuses()).contains("Checking the result - fixing 1 problem before saving");
    }

    @Test
    void anImportThatIsStillBrokenAfterTheRepairIsSavedWithAWarningRatherThanHidden() {
        String page = "<file path=\"src/pages/Index.tsx\">import { motion } from \"framer-motion\";\nexport default 1;</file>";
        modelReturns(answer(page + "<message>Done.</message>"), answer("<message>It should be fine.</message>"));

        run();

        verify(buildModel, times(1 + GenerationProperties.defaults().maxRepairs())).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).singleElement().asString()
                .contains("imports \"framer-motion\"").contains("ask me to fix it");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
    }

    private static final String TYPED_PAGE = "<file path=\"src/pages/Index.tsx\">export default function Index() {\n"
            + "  const count: number = \"three\";\n  return <p>{count}</p>;\n}\n</file>";

    private static CodeCheckResponse typeError() {
        return CodeCheckResponse.of(List.of(new CodeCheckResponse.Problem("src/pages/Index.tsx", 2, 9, "TS2322",
                "Type 'string' is not assignable to type 'number'.")));
    }

    @Test
    void anErrorTheCompilerFindsIsSentBackWithItsLinesAndTheRepairIsCheckedAgain() {
        when(codeChecker.check(any(), any(), any())).thenReturn(typeError(), CodeCheckResponse.of(List.of()));
        modelReturns(
                answer("<message>Writing the page.</message>" + TYPED_PAGE + "<message>Done.</message>"),
                answer(edit("src/pages/Index.tsx", "  const count: number = \"three\";\n", "  const count: number = 3;\n")
                        + "<message>Fixed the count.</message>"));

        run();

        String repair = conversations(2).get(1).getLast().getText();
        assertThat(repair)
                .contains("Errors the TypeScript compiler found")
                .contains("src/pages/Index.tsx, line 2: Type 'string' is not assignable to type 'number'.")
                .contains("> 2 |   const count: number = \"three\";");
        verify(codeChecker, times(2)).check(eq(PROJECT_ID), any(), any());
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).singleElement()
                .satisfies(file -> assertThat(file.content()).contains("const count: number = 3;"));
        assertThat(statuses()).contains("Checking the code before saving", "Checking the result - fixing 1 problem before saving");
    }

    @Test
    void aCompilerErrorThatSurvivesEveryRepairIsSavedWithANoteNamingIt() {
        when(codeChecker.check(any(), any(), any())).thenReturn(typeError());
        modelReturns(answer(TYPED_PAGE + "<message>Done.</message>"), answer("<message>It should be fine.</message>"));

        run();

        verify(buildModel, times(1 + GenerationProperties.defaults().maxRepairs())).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).singleElement().asString()
                .contains("src/pages/Index.tsx, line 2").contains("ask me to fix it");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
    }

    @Test
    void aPackageThatDoesNotExistIsSentBackToBeTakenOut() {
        when(codeChecker.check(any(), any(), any())).thenReturn(
                CodeCheckResponse.of(List.of(new CodeCheckResponse.Problem("package.json", 0, 0, "NPM",
                        "The package \"react-magic-charts\" does not exist in the npm registry, so it cannot be installed."))),
                CodeCheckResponse.of(List.of()));
        String packageJson = "<file path=\"package.json\">{ \"dependencies\": { \"react\": \"^18.3.1\", "
                + "\"react-magic-charts\": \"^1.0.0\" } }</file>";
        modelReturns(
                answer("<message>Adding a chart package.</message>" + packageJson + "<message>Done.</message>"),
                answer("<file path=\"package.json\">{ \"dependencies\": { \"react\": \"^18.3.1\" } }</file>"
                        + "<message>Using what is installed.</message>"));

        run();

        assertThat(conversations(2).get(1).getLast().getText())
                .contains("package.json: The package \"react-magic-charts\" does not exist in the npm registry");
        assertThat(recorded.get().notices()).isEmpty();
    }

    @Test
    void theCompilerIsNotAskedAboutFilesThatAlreadyFailACheaperCheck() {
        String page = "<file path=\"src/pages/Index.tsx\">import { motion } from \"framer-motion\";\nexport default 1;</file>";
        modelReturns(answer(page + "<message>Done.</message>"), answer("<message>It should be fine.</message>"));

        run();

        verify(codeChecker, never()).check(any(), any(), any());
    }

    @Test
    void aTurnThatWroteNoFilesIsNotChecked() {
        modelReturns(answer("<message>The routing lives in src/App.tsx.</message>"));

        run();

        verify(codeChecker, never()).check(any(), any(), any());
    }

    @Test
    void aCheckThatCouldNotBeMadeSavesTheTurnAsItIs() {
        modelReturns(answer(TYPED_PAGE + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        verify(codeChecker, times(1)).check(eq(PROJECT_ID), any(), any());
        assertThat(recorded.get().notices()).isEmpty();
    }

    private void indexPageIsStored() {
        when(projectFileReader.getFileContent(PROJECT_ID, "src/pages/Index.tsx"))
                .thenReturn(new FileContentDto("src/pages/Index.tsx", INDEX_PAGE));
    }

    private static String edit(String path, String search, String replace) {
        return "<edit path=\"" + path + "\">\n<<<<<<< SEARCH\n" + search + "=======\n" + replace + ">>>>>>> REPLACE\n</edit>";
    }

    @Test
    void aChangeToPartOfAFileIsSavedAsTheWholeFileWithOnlyThoseLinesChanged() {
        indexPageIsStored();
        modelReturns(answer("<message>Changing the title.</message>"
                + "<todo path=\"src/pages/Index.tsx\">Renaming the heading</todo>"
                + edit("src/pages/Index.tsx", "  const title = \"Hello\";\n", "  const title = \"Welcome\";\n")
                + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.FILE_EDIT,
                ChatEventType.MESSAGE);
        assertThat(recorded.get().events().get(2).content()).isEqualTo(INDEX_PAGE.replace("\"Hello\"", "\"Welcome\""));
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void anEditWhoseTextIsNotInTheFileIsTakenBackOutAndTheModelIsAskedForItAgain() {
        indexPageIsStored();
        String wrong = edit("src/pages/Index.tsx", "  const heading = \"Hello\";\n", "  const heading = \"Welcome\";\n");
        modelReturns(
                answer("<message>Changing the title.</message>" + wrong + "<message>Done.</message>"),
                answer(edit("src/pages/Index.tsx", "  const title = \"Hello\";\n", "  const title = \"Welcome\";\n")
                        + "<message>Now it is.</message>"));

        run();

        List<Message> repair = conversations(2).get(1);
        assertThat(repair.get(1).getText()).doesNotContain("const heading");
        assertThat(repair.get(2).getText())
                .contains("Edits that could not be applied")
                .contains("src/pages/Index.tsx: the SEARCH text is not in the file")
                .contains("const heading = \"Hello\";")
                .contains("--- src/pages/Index.tsx, exactly as it is now ---\n" + INDEX_PAGE + "--- end of src/pages/Index.tsx ---");
        assertThat(generation.text()).doesNotContain("<message>Done.</message>");
        assertThat(generation.text()).doesNotContain("const heading").contains("const title = \"Welcome\"");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).singleElement()
                .extracting(ParsedEvent::content).isEqualTo(INDEX_PAGE.replace("\"Hello\"", "\"Welcome\""));
        assertThat(recorded.get().notices()).isEmpty();
    }

    @Test
    void anEditThatStillCannotBeAppliedLeavesTheFileAloneAndSaysSoWhileTheRestIsSaved() {
        indexPageIsStored();
        String wrong = edit("src/pages/Index.tsx", "  const heading = \"Hello\";\n", "  const heading = \"Welcome\";\n");
        modelReturns(answer("<message>On it.</message>" + TYPE_FILE + wrong + "<message>Done.</message>"),
                answer(wrong + "<message>Done.</message>"));

        turn(quick(Duration.ofSeconds(5))).run(request, generation);

        verify(buildModel, times(2)).stream(any(), any(), any(), any());
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::path)
                .containsExactly("src/types/todo.ts");
        assertThat(recorded.get().events()).noneMatch(event -> event.type() == ChatEventType.FILE_PATCH);
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.INCOMPLETE);
        assertThat(recorded.get().notices()).singleElement().asString()
                .isEqualTo("I couldn't apply my change to src/pages/Index.tsx, so that file was left as it was. "
                        + "Ask me to make that change again.");
    }

    @Test
    void aFileThatDoesNotParseIsSentBackWithTheLinesAroundTheErrorAndMendedWithAnEdit() {
        String broken = "<file path=\"src/lib/total.ts\">export function total(a: number, b: number) {\n"
                + "  const sum = a + ;\n  return sum;\n}</file>";
        modelReturns(
                answer("<message>Adding the helper.</message>" + broken + "<message>Done.</message>"),
                answer(edit("src/lib/total.ts", "  const sum = a + ;\n", "  const sum = a + b;\n")
                        + "<message>Fixed.</message>"));

        run();

        List<Message> repair = conversations(2).get(1);
        assertThat(repair.get(2).getText())
                .contains("Files that do not parse")
                .contains("src/lib/total.ts line 2: ")
                .contains("> 2 |   const sum = a + ;");
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).singleElement()
                .extracting(ParsedEvent::content)
                .isEqualTo("export function total(a: number, b: number) {\n  const sum = a + b;\n  return sum;\n}\n");
        assertThat(recorded.get().notices()).isEmpty();
    }

    @Test
    void aFileThatStillDoesNotParseAfterTheRepairsIsSavedWithAWarningNamingTheLine() {
        String broken = "<file path=\"src/lib/total.ts\">export const total = (a: number) => a + ;</file>";
        modelReturns(answer(broken + "<message>Done.</message>"), answer("<message>It should be fine.</message>"));

        turn(quick(Duration.ofSeconds(5))).run(request, generation);

        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
        assertThat(recorded.get().notices()).singleElement().asString()
                .startsWith("Heads up: src/lib/total.ts has a syntax error on line 1 - ").contains("ask me to fix it");
    }

    @Test
    void aStrayBackslashIsNotSentBackForRepairBecauseTheSaveTakesItOutAnyway() {
        modelReturns(answer("<file path=\"src/lib/total.ts\">export const total = (a: number) => {\\\n  return a;\n};</file>"
                + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().notices()).isEmpty();
    }

    @Test
    void aTurnWhoseImportsAllResolveMakesNoRepairCall() {
        modelReturns(answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().notices()).isEmpty();
    }

    @Test
    void whenTheProjectsFilesCannotBeListedTheTurnIsSavedUncheckedRatherThanLost() {
        when(projectFileReader.getFileTree(PROJECT_ID)).thenThrow(new RuntimeException("workspace-service is down"));
        modelReturns(answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        assertThat(recorded.get().outcome()).isNull();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("SAVED"));
    }

    @Test
    void aFinalMessageTheModelForgotToCloseIsKeptRatherThanDropped() {
        modelReturns(answer(TYPE_FILE.replace("src/types/todo.ts", "src/lib/a.ts") + "<message>All done, the helper is in place."));

        run();

        assertThat(recordedTypes()).containsExactly(ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);
        assertThat(recorded.get().events().getLast().content()).isEqualTo("All done, the helper is in place.");
    }

    @Test
    void anAnswerWhoseOnlyMessageWasNeverClosedIsKeptWithoutAskingAgain() {
        modelReturns(answer("<message>Routing lives in App.tsx, with one route per page."));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE);
        assertThat(recorded.get().events().getFirst().content()).isEqualTo("Routing lives in App.tsx, with one route per page.");
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(statuses()).doesNotContain("No answer came back - trying again");
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("ANSWERED"));
    }

    @Test
    void anAnswerInPlainWordsIsAskedForAgainAndKeptAsTheAnswerIfItStaysThatWay() {
        modelReturns(answer("Sure - I can help with that."),
                answer("Routing lives in App.tsx.\n\nEach page has its own route."));

        run();

        List<Message> secondAsk = conversations(2).get(1);
        assertThat(secondAsk).hasSize(3);
        assertThat(secondAsk.get(1)).isInstanceOf(AssistantMessage.class);
        assertThat(secondAsk.get(1).getText()).isEqualTo("Sure - I can help with that.");
        assertThat(secondAsk.get(2).getText()).contains("did not use the required tags").contains("<message>");
        assertThat(statuses()).contains("The reply wasn't in a form that can be saved - asking again");
        assertThat(recordedTypes()).containsExactly(ChatEventType.MESSAGE);
        assertThat(recorded.get().events().getFirst().content())
                .isEqualTo("Routing lives in App.tsx.\n\nEach page has its own route.");
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).isEmpty();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("ANSWERED"));
    }

    @Test
    void aModelToldItsReplyHadNoTagsUsuallyDoesTheWorkTheSecondTime() {
        modelReturns(answer("I'll build the todo app with a hook and two components."),
                answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(2);
        assertThat(recorded.get().events()).noneMatch(event -> event.content().contains("I'll build the todo app with a hook"));
        assertThat(recorded.get().outcome()).isNull();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("SAVED"));
    }

    @Test
    void aLongReplyWithNoTagsIsShownBackOnlyInPart() {
        modelReturns(answer("word ".repeat(2_000)), answer("<message>Here it is.</message>"));

        run();

        assertThat(conversations(2).get(1).get(1).getText()).hasSize(BuildTurn.MAX_UNTAGGED_REPLAYED);
    }

    @Test
    void filesWrittenOutsideTheProtocolAreNotPastedIntoTheChatAsAnAnswer() {
        String malformed = "<file name=\"src/a.ts\">export const a = 1;</file>";
        modelReturns(answer(malformed), answer(malformed));

        run();

        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.EMPTY);
        assertThat(recorded.get().events()).isEmpty();
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.EMPTY_ANSWER_NOTICE);
    }

    @Test
    void readingFilesAndThenSayingNothingIsAnEmptyAnswerNotASavedOne() {
        when(buildModel.stream(any(), any(), any(), any())).thenAnswer(call -> {
            CodeGenerationTools tools = call.getArgument(1);
            tools.readFiles(List.of("src/App.tsx"));
            return Flux.empty();
        });

        run();

        verify(buildModel, times(2)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.EMPTY);
        assertThat(recordedTypes()).isEmpty();
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.EMPTY_ANSWER_NOTICE);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("EMPTY"));
    }

    @Test
    void aTurnWhoseEveryFileHadAnUnusablePathSaysSoRatherThanThatNothingCameBack() {
        String refused = "<file path=\"../outside.ts\">export const a = 1;</file>";
        modelReturns(answer(refused), answer(refused));

        run();

        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.EMPTY);
        assertThat(recorded.get().notices()).singleElement().asString()
                .contains("../outside.ts").endsWith("Nothing was changed.");
    }

    @Test
    void theModelIsNotShownTheReadNotesTheServerWroteIntoItsReply() {
        when(buildModel.stream(any(), any(), any(), any()))
                .thenAnswer(call -> {
                    CodeGenerationTools tools = call.getArgument(1);
                    tools.readFiles(List.of("src/App.tsx"));
                    return answer(PLAN + TYPE_FILE + "<message>Done.</message>");
                })
                .thenAnswer(call -> answer(HOOK_FILE + "<message>Added the hook.</message>"));

        run();

        Message carriedOn = conversations(2).get(1).get(1);
        assertThat(carriedOn).isInstanceOf(AssistantMessage.class);
        assertThat(carriedOn.getText()).startsWith("<message>I'll build the todo app.</message>").endsWith(TYPE_FILE)
                .doesNotContain("<tool").doesNotContain("Reading 1 file");
        assertThat(recordedTypes()).contains(ChatEventType.TOOL_LOG);
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void aTurnThatTaggedItsWorkButNotItsWordsKeepsTheWordsAsItsOpeningAndClosingMessages() {
        when(buildModel.stream(any(), any(), any(), any())).thenAnswer(call -> {
            CodeGenerationTools tools = call.getArgument(1);
            tools.readFiles(List.of("src/App.tsx"));
            return answer("I will add the todo type and the hook that uses it.\n\n"
                    + "<todo path=\"src/types/todo.ts\">Defining the todo type</todo>\n"
                    + "<todo path=\"src/hooks/useTodos.ts\">Building the todo state hook</todo>\n"
                    + "Here are the changes:\n" + TYPE_FILE + "\n" + HOOK_FILE + "\n\n"
                    + "I have added the type and the hook.");
        });

        run();

        assertThat(recordedTypes()).containsExactly(ChatEventType.TOOL_LOG, ChatEventType.MESSAGE, ChatEventType.TODO,
                ChatEventType.TODO, ChatEventType.FILE_EDIT, ChatEventType.FILE_EDIT, ChatEventType.MESSAGE);
        assertThat(recorded.get().events().get(1).content()).isEqualTo("I will add the todo type and the hook that uses it.");
        assertThat(recorded.get().events().getLast().content()).isEqualTo("I have added the type and the hook.");
        assertThat(recorded.get().events()).noneMatch(event -> "Here are the changes:".equals(event.content()));
        assertThat(recorded.get().outcome()).isNull();
        verify(buildModel, times(1)).stream(any(), any(), any(), any());
    }

    @Test
    void aTurnThatAlreadySaidSomethingInAMessageKeepsNothingFromOutsideItsTags() {
        modelReturns(answer("Let me think about this first.\n<message>Adding the type.</message>" + PLAN.replace(
                "<message>I'll build the todo app.</message>\n", "") + TYPE_FILE + HOOK_FILE + "\nAll done here."));

        run();

        assertThat(recorded.get().events()).filteredOn(event -> event.type() == ChatEventType.MESSAGE)
                .extracting(ParsedEvent::content).containsExactly("Adding the type.");
    }

    @Test
    void codeWrittenOutsideTheTagsIsNotKeptAsAMessageEvenWhenNothingElseWasSaid() {
        modelReturns(answer(TYPE_FILE + "\nAnd the hook:\n```ts\n<file path=\"src/hooks/broken\n```\n"));

        run();

        assertThat(recorded.get().events()).noneMatch(event -> event.type() == ChatEventType.MESSAGE);
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
    }

    @Test
    void theProjectIsDescribedOnceAndEveryCallOfTheTurnIsGivenThatSameDescription() {
        ProjectBrief brief = ProjectBrief.of(
                List.of(new FileTreeDto.Entry("src/App.tsx", 20, "text/plain")), path -> "export default 1;\n", null);
        when(buildModel.describe(eq(PROJECT_ID), any())).thenReturn(brief);
        modelReturns(
                answer(PLAN + TYPE_FILE + "<message>Done.</message>"),
                answer(HOOK_FILE + "<message>Added the hook.</message>"));

        run();

        verify(buildModel, times(1)).describe(eq(PROJECT_ID), any());
        ArgumentCaptor<ProjectBrief> given = ArgumentCaptor.forClass(ProjectBrief.class);
        verify(buildModel, times(2)).stream(any(), any(), given.capture(), any());
        assertThat(given.getAllValues()).containsExactly(brief, brief);
    }

    @Test
    void theReadToolIsToldWhichFilesTheModelWasAlreadyShown() {
        when(buildModel.describe(eq(PROJECT_ID), any())).thenReturn(ProjectBrief.of(
                List.of(new FileTreeDto.Entry("src/App.tsx", 20, "text/plain")), path -> "export default 1;\n", null));
        AtomicReference<List<String>> toolAnswer = new AtomicReference<>();
        when(buildModel.stream(any(), any(), any(), any())).thenAnswer(call -> {
            CodeGenerationTools tools = call.getArgument(1);
            toolAnswer.set(tools.readFiles(List.of("src/App.tsx", "src/main.tsx")));
            return answer("<message>Routing is set up in App.tsx.</message>");
        });

        run();

        assertThat(toolAnswer.get().get(0)).contains("ALREADY SHOWN: src/App.tsx");
        assertThat(toolAnswer.get().get(1)).contains("START OF FILE: src/main.tsx");
        assertThat(recorded.get().events().getFirst().metadata()).isEqualTo("src/main.tsx");
        assertThat(statuses()).contains("Reading 1 file");
    }

    @Test
    void aProjectThatCannotBeDescribedFailsTheTurnWithANoteInsteadOfHangingIt() {
        when(buildModel.describe(eq(PROJECT_ID), any())).thenThrow(new IllegalStateException("workspace-service is down"));

        run();

        verify(buildModel, never()).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.FAILED_NOTICE);
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
    }

    @Test
    void aFileWithAPathOutsideTheProjectIsRefusedAndNamedWhileTheRestIsKept() {
        modelReturns(answer("<file path=\"../secrets.txt\">nope</file>" + TYPE_FILE + "<message>Done.</message>"));

        run();

        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::path)
                .containsExactly("src/types/todo.ts");
        assertThat(recorded.get().notices()).singleElement().asString().contains("../secrets.txt");
    }

    @Test
    void stoppingATurnEndsItPromptlyAndRecordsItAsStoppedWithNothingToSave() throws Exception {
        Flux<ChatResponse> writing = Flux.concat(
                Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(PLAN + TYPE_FILE))))), Flux.never());
        modelReturns(writing);
        CountDownLatch finished = new CountDownLatch(1);

        Thread runner = Thread.ofVirtual().start(() -> {
            run();
            finished.countDown();
        });
        awaitText(TYPE_FILE);

        assertThat(generation.requestStop()).isTrue();

        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        runner.join();
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.STOPPED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.STOPPED_NOTICE);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("STOPPED"));
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        verify(buildModel, times(1)).stream(any(), any(), any(), any());
    }

    @Test
    void aStoppedTurnKeepsTheMessageItWasInTheMiddleOf() throws Exception {
        Flux<ChatResponse> writing = Flux.concat(
                Flux.just(new ChatResponse(List.of(new Generation(
                        new AssistantMessage(TYPE_FILE + "<message>The type is in. Next I'll add"))))), Flux.never());
        modelReturns(writing);
        CountDownLatch finished = new CountDownLatch(1);

        Thread runner = Thread.ofVirtual().start(() -> {
            run();
            finished.countDown();
        });
        awaitText("Next I'll add");
        generation.requestStop();

        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        runner.join();
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.STOPPED);
        assertThat(recorded.get().events()).filteredOn(event -> event.type() == ChatEventType.MESSAGE)
                .singleElement().satisfies(event -> assertThat(event.content()).isEqualTo("The type is in. Next I'll add"));
    }

    @Test
    void aTurnTheServerAbandonsAsItShutsDownIsRecordedAsFailedAndSaysTheServerRestarted() throws Exception {
        Flux<ChatResponse> writing = Flux.concat(
                Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(PLAN + TYPE_FILE))))), Flux.never());
        modelReturns(writing);
        CountDownLatch finished = new CountDownLatch(1);

        Thread runner = Thread.ofVirtual().start(() -> {
            run();
            finished.countDown();
        });
        awaitText(TYPE_FILE);

        assertThat(generation.abandon()).isTrue();

        assertThat(finished.await(5, TimeUnit.SECONDS)).isTrue();
        runner.join();
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.INTERRUPTED_NOTICE);
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("FAILED"));
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        verify(buildModel, times(1)).stream(any(), any(), any(), any());
    }

    private void awaitText(String expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5_000;
        while (!generation.text().contains(expected)) {
            assertThat(System.currentTimeMillis()).as("the model's text never arrived").isLessThan(deadline);
            Thread.sleep(10);
        }
    }

    @Test
    void eachCallIsChargedWhatTheProviderReportsTheFirstAsTheBuildAndLaterOnesAsRetries() {
        modelReturns(
                answer(PLAN + TYPE_FILE + "<message>Done.</message>", "stop", 1000, 200),
                answer(HOOK_FILE + "<message>Added.</message>", "stop", 1500, 100));

        run();

        ArgumentCaptor<UsageRecord> charged = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService, times(2)).settleCall(eq(reservation), charged.capture(), anyInt());
        assertThat(charged.getAllValues()).extracting(UsageRecord::feature)
                .containsExactly(UsageFeature.BUILD, UsageFeature.BUILD_RETRY);
        assertThat(charged.getAllValues()).extracting(UsageRecord::totalTokens).containsExactly(1200, 1600);
        assertThat(charged.getAllValues()).extracting(UsageRecord::userId).containsOnly(USER_ID);
        assertThat(recorded.get().promptTokens()).isEqualTo(2500);
        assertThat(recorded.get().completionTokens()).isEqualTo(300);
    }

    @Test
    void theTurnKeepsItsHoldOnTheAllowanceUntilItEndsAndGivesItBackExactlyOnce() {
        modelReturns(
                answer(PLAN + TYPE_FILE + "<message>Done.</message>"),
                answer(HOOK_FILE + "<message>Added.</message>"));

        run();

        verify(aiUsageRecorder, times(1)).release(reservation);
        assertThat(generation.takeReservation()).isNull();
    }

    @Test
    void aCallThatEndedWithoutAUsageReportIsChargedAnEstimateOfWhatWasSentAndWhatItWrote() {
        String text = "<message>" + "word ".repeat(80) + "</message>";
        modelReturns(Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(text))))));

        run();

        ArgumentCaptor<UsageRecord> estimate = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService).settleCall(eq(reservation), estimate.capture(), anyInt());
        assertThat(estimate.getValue().outputTokens()).isEqualTo(text.length() / 4);
        assertThat(estimate.getValue().inputTokens()).isGreaterThan(PromptUtils.getSystemPrompt().length() / 5);
        assertThat(estimate.getValue().totalTokens())
                .isEqualTo(estimate.getValue().inputTokens() + estimate.getValue().outputTokens());
        assertThat(estimate.getValue().feature()).isEqualTo(UsageFeature.BUILD);
    }

    @Test
    void aCallThatProducedNothingIsChargedNothing() {
        modelReturns(Flux.empty(), answer("<message>Second time lucky.</message>"));

        run();

        ArgumentCaptor<UsageRecord> charged = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService, times(2)).settleCall(eq(reservation), charged.capture(), anyInt());
        assertThat(charged.getAllValues().getFirst()).isNull();
        assertThat(charged.getAllValues().getLast()).isNotNull();
    }

    @Test
    void theCallsEstimatedSpendIsReportedAsItIsWrittenSoTheMeterCanFollowIt() {
        modelReturns(answer(PLAN + TYPE_FILE + "<file path=\"src/hooks/useTodos.ts\">" + "const a = 1;\n".repeat(200)
                + "</file><message>Done.</message>"));

        run();

        ArgumentCaptor<Integer> estimates = ArgumentCaptor.forClass(Integer.class);
        verify(usageService, atLeast(2)).exceedsBudget(eq(reservation), estimates.capture());
        assertThat(estimates.getAllValues()).isSorted();
        assertThat(estimates.getAllValues().getLast()).isGreaterThan(estimates.getAllValues().getFirst());
        assertThat(recorded.get().outcome()).isNull();
    }

    @Test
    void aCallThatRunsOutOfAllowanceIsEndedThereAndTheFilesItFinishedAreSaved() {
        when(usageService.exceedsBudget(any(), anyInt())).thenReturn(false, true);
        modelReturns(Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(
                        PLAN + TYPE_FILE + "<file path=\"src/hooks/useTodos.ts\">" + "const a = 1;\n".repeat(200))))))
                .concatWith(Flux.never()));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.OUT_OF_BUDGET);
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).extracting(ParsedEvent::path)
                .containsExactly("src/types/todo.ts");
        assertThat(recorded.get().notices()).singleElement().asString()
                .contains("ran out part-way through").contains("1 of 2 steps were finished and saved")
                .contains("refills at midnight");
        assertThat(statuses()).contains("Today's AI allowance ran out - keeping what was finished");
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("OUT_OF_BUDGET"));
        ArgumentCaptor<UsageRecord> charged = ArgumentCaptor.forClass(UsageRecord.class);
        verify(usageService).settleCall(eq(reservation), charged.capture(), anyInt());
        assertThat(charged.getValue().totalTokens()).isPositive();
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
    }

    @Test
    void aTurnWithNoAllowanceEvenToSendItsPromptMakesNoCallAndChangesNothing() {
        when(usageService.exceedsBudget(any(), anyInt())).thenReturn(true);

        run();

        verify(buildModel, never()).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.OUT_OF_BUDGET);
        assertThat(recorded.get().events()).isEmpty();
        assertThat(recorded.get().notices()).singleElement().asString()
                .contains("before any file was finished, so nothing was changed");
        assertThat(statuses()).contains("Today's AI allowance ran out");
    }

    @Test
    void aReplyThatStoppedEarlyIsNotCarriedOnWhenThereIsNoAllowanceLeftForAnotherCall() {
        when(usageService.settleCall(any(), any(), anyInt())).thenReturn(true);
        modelReturns(answer(PLAN + TYPE_FILE + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.OUT_OF_BUDGET);
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(1);
        assertThat(recorded.get().notices()).singleElement().asString().contains("1 of 2 steps were finished and saved");
    }

    @Test
    void aFinishedTurnWhoseImportsNeedRepairSavesWithAWarningRatherThanSpendAllowanceItDoesNotHave() {
        when(usageService.settleCall(any(), any(), anyInt())).thenReturn(true);
        String page = "<file path=\"src/pages/Index.tsx\">import { useTodos } from \"../hooks/useTodos\";\n"
                + "export default function Index() { useTodos(); return null; }</file>";
        modelReturns(answer("<message>Wiring the page.</message>" + page + "<message>Done.</message>"));

        run();

        verify(buildModel, times(1)).stream(any(), any(), any(), any());
        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().notices()).singleElement().asString().startsWith("Heads up:");
    }

    @Test
    void aCheckOnTheAllowanceThatFailsNeverStopsATurn() {
        when(usageService.exceedsBudget(any(), anyInt())).thenThrow(new IllegalStateException("database down"));
        when(usageService.settleCall(any(), any(), anyInt())).thenThrow(new IllegalStateException("database down"));
        modelReturns(answer(PLAN + TYPE_FILE + HOOK_FILE + "<message>Done.</message>"));

        run();

        assertThat(recorded.get().outcome()).isNull();
        assertThat(recorded.get().events()).filteredOn(ParsedEvent::isFileChange).hasSize(2);
    }

    @Test
    void aTurnThatCannotBeSavedStillLeavesTheRegistryAndTellsItsViewers() {
        doThrow(new IllegalStateException("database down")).when(recorder).record(any());
        modelReturns(answer("<message>Done.</message>"));

        run();

        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        assertThat(viewerError.get()).hasMessage("database down");
        assertThat(generation.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void aTurnThatBlowsUpWhileBeingWrittenIsStillRecordedAsFailed() {
        when(buildModel.stream(any(), any(), any(), any())).thenThrow(new IllegalStateException("prompt could not be built"));

        run();

        assertThat(recorded.get().outcome()).isEqualTo(TurnOutcome.FAILED);
        assertThat(recorded.get().notices()).containsExactly(BuildTurn.FAILED_NOTICE);
        assertThat(registry.find(PROJECT_ID, USER_ID)).isEmpty();
        assertThat(signals.getLast()).isEqualTo(GenerationSignal.done("FAILED"));
    }
}
