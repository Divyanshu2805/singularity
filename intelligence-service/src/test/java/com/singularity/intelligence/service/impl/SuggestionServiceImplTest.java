package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileTreeDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.stub.StubChatModel;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the next steps suggested under a finished build.
 *
 * <p>The service must give suggestions after a turn that changed files and nothing - quietly - in every other case:
 * no conversation, a turn that only answered, no allowance, a provider that failed. It must also spend nothing in
 * the cases where it does not ask, charge the call that it does make under its own name, give back the allowance
 * it held when the call fails, and never put a file's content in front of the model. The model here is the scripted
 * one, so the whole path from the saved conversation to the parsed list runs for real.
 */
class SuggestionServiceImplTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;

    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final ChatSessionRepository sessions = mock(ChatSessionRepository.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ProjectFileReader files = mock(ProjectFileReader.class);
    private final UsageService usageService = mock(UsageService.class);
    private final AiUsageRecorder usageRecorder = mock(AiUsageRecorder.class);
    private final AtomicReference<Prompt> sent = new AtomicReference<>();
    private final UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.now(), 12_000);
    private final ChatSession session = ChatSession.builder().id(new ChatSessionId(PROJECT_ID, USER_ID)).build();

    private SuggestionServiceImpl service(ChatModel model) {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(usageService.reserveBudget(UsageFeature.SUGGEST)).thenReturn(reservation);
        when(files.getFileTree(PROJECT_ID)).thenReturn(new FileTreeDto(PROJECT_ID, List.of(
                new FileTreeDto.Entry("src/pages/Index.tsx", 900, "text/plain"),
                new FileTreeDto.Entry("package.json", 400, "application/json"))));
        return new SuggestionServiceImpl(authUtil, sessions, messages, files, usageService, usageRecorder,
                ChatClient.builder(model).build(), new ModelCalls(AiCallProperties.defaults()));
    }

    private ChatModel scripted() {
        StubChatModel stub = new StubChatModel(Duration.ZERO);
        return new ChatModel() {
            @Override
            public ChatResponse call(Prompt prompt) {
                sent.set(prompt);
                return stub.call(prompt);
            }
        };
    }

    private void theConversationIs(ChatMessage... turns) {
        when(sessions.findById(new ChatSessionId(PROJECT_ID, USER_ID))).thenReturn(Optional.of(session));
        when(messages.findByChatSession(session)).thenReturn(List.of(turns));
    }

    private static ChatMessage asked(String content) {
        return ChatMessage.builder().role(MessageRole.USER).content(content).build();
    }

    private static ChatMessage replied(ChatEvent... events) {
        ChatMessage reply = ChatMessage.builder().role(MessageRole.ASSISTANT).build();
        reply.setEvents(List.of(events));
        return reply;
    }

    private static ChatEvent said(String content) {
        return ChatEvent.builder().type(ChatEventType.MESSAGE).content(content).build();
    }

    private static ChatEvent wrote(String path) {
        return ChatEvent.builder().type(ChatEventType.FILE_EDIT).filePath(path)
                .content("const SECRET_IN_THE_FILE = 1;").build();
    }

    @Test
    void aBuildThatChangedFilesGetsThreeSuggestionsAndIsChargedUnderItsOwnName() {
        theConversationIs(asked("**Build:** A quick notes app."),
                replied(said("Type a note and press Enter."), wrote("src/pages/Index.tsx")));

        List<String> suggestions = service(scripted()).nextSteps(PROJECT_ID);

        assertThat(suggestions).hasSize(3).allSatisfy(suggestion -> assertThat(suggestion).isNotBlank());
        verify(usageRecorder).reconcile(eq(reservation), any(ChatResponse.class), eq(UsageFeature.SUGGEST), eq(PROJECT_ID));
        verify(usageRecorder, never()).release(any());
    }

    @Test
    void theModelIsToldWhatWasAskedAndTouchedButNeverShownAFilesContent() {
        theConversationIs(asked("**Build:** A quick notes app."),
                replied(said("Type a note and press Enter."), wrote("src/pages/Index.tsx")));

        service(scripted()).nextSteps(PROJECT_ID);

        String everything = sent.get().getInstructions().stream().map(message -> message.getText())
                .reduce("", (all, next) -> all + "\n" + next);
        assertThat(everything).contains("A quick notes app.").contains("Type a note and press Enter.")
                .contains("src/pages/Index.tsx").doesNotContain("SECRET_IN_THE_FILE").doesNotContain("package.json");
    }

    @Test
    void aTurnThatOnlyAnsweredGetsNoSuggestionsAndSpendsNothing() {
        theConversationIs(asked("how does the routing work?"), replied(said("It lives in src/App.tsx.")));

        assertThat(service(scripted()).nextSteps(PROJECT_ID)).isEmpty();

        verify(usageService, never()).reserveBudget(any());
        assertThat(sent.get()).isNull();
    }

    @Test
    void aProjectWithNoConversationGetsNoSuggestions() {
        when(sessions.findById(any())).thenReturn(Optional.empty());

        assertThat(service(scripted()).nextSteps(PROJECT_ID)).isEmpty();

        verify(usageService, never()).reserveBudget(any());
    }

    @Test
    void aConversationThatEndsOnTheRequestGetsNoSuggestions() {
        theConversationIs(asked("**Build:** A quick notes app."));

        assertThat(service(scripted()).nextSteps(PROJECT_ID)).isEmpty();
    }

    @Test
    void withNoAllowanceLeftTheModelIsNotAskedAndNothingIsShownAsAnError() {
        theConversationIs(asked("add a counter"), replied(said("Done."), wrote("src/pages/Index.tsx")));
        SuggestionServiceImpl service = service(scripted());
        when(usageService.reserveBudget(UsageFeature.SUGGEST)).thenThrow(mock(QuotaExceededException.class));

        assertThat(service.nextSteps(PROJECT_ID)).isEmpty();

        assertThat(sent.get()).isNull();
    }

    @Test
    void aProviderThatFailsGivesNoSuggestionsAndTheHeldAllowanceBack() {
        theConversationIs(asked("add a counter"), replied(said("Done."), wrote("src/pages/Index.tsx")));
        ChatModel failing = prompt -> {
            throw new IllegalStateException("provider down");
        };

        assertThat(service(failing).nextSteps(PROJECT_ID)).isEmpty();

        verify(usageRecorder).release(reservation);
    }

    @Test
    void anUnreadableFileTreeDoesNotStopTheSuggestions() {
        theConversationIs(asked("add a counter"), replied(said("Done."), wrote("src/pages/Index.tsx")));
        SuggestionServiceImpl service = service(scripted());
        when(files.getFileTree(PROJECT_ID)).thenThrow(new IllegalStateException("workspace-service is down"));

        assertThat(service.nextSteps(PROJECT_ID)).hasSize(3);
    }
}
