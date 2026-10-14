package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.stub.StubChatModel;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the title written for a project that has none.
 *
 * <p>The service must answer with a title a project already has and spend nothing; otherwise write one from the
 * caller's first request, charged as project naming, and hand it to workspace-service - answering with whatever that
 * stored, so a rename that landed first wins. Every way of not having a clean title - no request, no allowance, a
 * provider that failed, an answer with nothing usable, storage that failed - is an empty answer, never an error. The
 * request reaches the model only as a user message. The model is the scripted one, so the parse runs for real.
 */
class ProjectTitleServiceImplTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;
    private static final String REQUEST = "**Build:** A quick notes app where I can jot things down.";

    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final WorkspaceServiceClient workspace = mock(WorkspaceServiceClient.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final UsageService usageService = mock(UsageService.class);
    private final AiUsageRecorder usageRecorder = mock(AiUsageRecorder.class);
    private final AtomicReference<Prompt> sent = new AtomicReference<>();
    private final UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.now(), 2_000);

    private ProjectTitleServiceImpl service(ChatModel model) {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(usageService.reserveBudget(UsageFeature.PROJECT_NAMING)).thenReturn(reservation);
        when(workspace.getProjectSummary(PROJECT_ID)).thenReturn(summary(null));
        when(workspace.titleProject(eq(PROJECT_ID), any())).thenAnswer(call -> call.getArgument(1));
        return new ProjectTitleServiceImpl(authUtil, workspace, messages, usageService, usageRecorder,
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

    private static ProjectSummaryDto summary(String title) {
        return new ProjectSummaryDto(PROJECT_ID, "Notes", false, false, null, title);
    }

    private void theFirstRequestIs(String request) {
        when(messages.findFirstRequests(eq(PROJECT_ID), eq(USER_ID), any())).thenReturn(
                request == null ? List.of() : List.of(request));
    }

    @Test
    void anUntitledProjectGetsATitleWrittenFromItsFirstRequestAndStored() {
        theFirstRequestIs(REQUEST);

        Optional<String> title = service(scripted()).title(PROJECT_ID);

        assertThat(title).contains("Quick notes you can jot and clear");
        verify(workspace).titleProject(PROJECT_ID, new ProjectTitleDto("Quick notes you can jot and clear"));
        verify(usageRecorder).reconcile(eq(reservation), any(ChatResponse.class), eq(UsageFeature.PROJECT_NAMING), eq(PROJECT_ID));
        verify(usageRecorder, never()).release(any());
    }

    @Test
    void theRequestReachesTheModelOnlyAsAUserMessage() {
        theFirstRequestIs(REQUEST);

        service(scripted()).title(PROJECT_ID);

        List<Message> instructions = sent.get().getInstructions();
        assertThat(instructions).filteredOn(message -> message.getMessageType() == MessageType.SYSTEM)
                .allSatisfy(message -> assertThat(message.getText()).doesNotContain("jot things down"));
        assertThat(instructions).filteredOn(message -> message.getMessageType() == MessageType.USER)
                .anySatisfy(message -> assertThat(message.getText()).contains("jot things down"));
    }

    @Test
    void aProjectThatHasATitleKeepsItAndNothingIsSpent() {
        ProjectTitleServiceImpl service = service(scripted());
        when(workspace.getProjectSummary(PROJECT_ID)).thenReturn(summary("Family recipe box"));

        assertThat(service.title(PROJECT_ID)).contains("Family recipe box");

        verify(usageService, never()).reserveBudget(any());
        verify(workspace, never()).titleProject(anyLong(), any());
        assertThat(sent.get()).isNull();
    }

    @Test
    void aRenameThatLandedFirstIsWhatComesBack() {
        theFirstRequestIs(REQUEST);
        ProjectTitleServiceImpl service = service(scripted());
        when(workspace.titleProject(eq(PROJECT_ID), any())).thenReturn(new ProjectTitleDto("My own name"));

        assertThat(service.title(PROJECT_ID)).contains("My own name");
    }

    @Test
    void aProjectNobodyHasAskedAnythingOfGetsNoTitleAndSpendsNothing() {
        theFirstRequestIs(null);

        assertThat(service(scripted()).title(PROJECT_ID)).isEmpty();

        verify(usageService, never()).reserveBudget(any());
    }

    @Test
    void withNoAllowanceLeftTheModelIsNotAsked() {
        theFirstRequestIs(REQUEST);
        ProjectTitleServiceImpl service = service(scripted());
        when(usageService.reserveBudget(UsageFeature.PROJECT_NAMING)).thenThrow(mock(QuotaExceededException.class));

        assertThat(service.title(PROJECT_ID)).isEmpty();

        assertThat(sent.get()).isNull();
    }

    @Test
    void aProviderThatFailsGivesNoTitleAndTheHeldAllowanceBack() {
        theFirstRequestIs(REQUEST);
        ChatModel failing = prompt -> {
            throw new IllegalStateException("provider down");
        };

        assertThat(service(failing).title(PROJECT_ID)).isEmpty();

        verify(usageRecorder).release(reservation);
        verify(workspace, never()).titleProject(anyLong(), any());
    }

    @Test
    void anAnswerWithNothingUsableIsNotStored() {
        theFirstRequestIs(REQUEST);
        ChatModel tagged = prompt -> new ChatResponse(List.of(new Generation(new AssistantMessage("<file path=\"x\">"))));

        ProjectTitleServiceImpl service = service(tagged);

        assertThat(service.title(PROJECT_ID)).isEmpty();
        verify(workspace, never()).titleProject(anyLong(), any());
    }

    @Test
    void storageThatFailsIsNoTitleRatherThanAnError() {
        theFirstRequestIs(REQUEST);
        ProjectTitleServiceImpl service = service(scripted());
        when(workspace.titleProject(eq(PROJECT_ID), any())).thenThrow(new IllegalStateException("workspace-service is down"));

        assertThat(service.title(PROJECT_ID)).isEmpty();
    }
}
