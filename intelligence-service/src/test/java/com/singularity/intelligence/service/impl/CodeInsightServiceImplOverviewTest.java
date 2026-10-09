package com.singularity.intelligence.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.dto.code.OverviewRequest;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.LearnerLevel;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.mapper.CodeNoteMapper;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.CodeNoteRepository;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Covers teaching mode's big picture of a turn: it is written only for a reply in the caller's own conversation, only
 * when that turn was asked for in teaching mode and wrote something, from the request, what the build said, its steps
 * and the paths it wrote - never a file's text - and once: the finished overview is kept on the reply and returned
 * afterwards without the model or the budget being touched.
 */
class CodeInsightServiceImplOverviewTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;
    private static final long REPLY_ID = 21L;

    private static final String PAGE = "export default function Index() {\n  return <main />;\n}\n";

    private final ChatClient chatClient = mock(ChatClient.class);
    private final ChatClient.ChatClientRequestSpec call = mock(ChatClient.ChatClientRequestSpec.class);
    private final ChatClient.StreamResponseSpec stream = mock(ChatClient.StreamResponseSpec.class);
    private final UsageService usageService = mock(UsageService.class);
    private final ChatEventRepository chatEventRepository = mock(ChatEventRepository.class);
    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final AiUsageRecorder aiUsageRecorder = mock(AiUsageRecorder.class);

    private final CodeInsightServiceImpl service = new CodeInsightServiceImpl(
            chatClient, new ModelCalls(AiCallProperties.defaults()), aiUsageRecorder,
            mock(WorkspaceServiceClient.class), mock(ProjectFileReader.class), usageService,
            mock(CodeNoteRepository.class), chatEventRepository, chatMessageRepository, mock(CodeNoteMapper.class),
            authUtil, mock(com.singularity.intelligence.repository.ProjectTourRepository.class),
            mock(com.singularity.intelligence.repository.GlossaryEntryRepository.class));

    CodeInsightServiceImplOverviewTest() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(chatClient.prompt()).thenReturn(call);
        when(call.system(anyString())).thenReturn(call);
        when(call.messages(anyList())).thenReturn(call);
        when(call.options(any())).thenReturn(call);
        when(call.tools(any(Object[].class))).thenReturn(call);
        when(call.stream()).thenReturn(stream);
    }

    private void savedReply(boolean teaching, String overview) {
        ChatMessage reply = ChatMessage.builder().id(REPLY_ID).role(MessageRole.ASSISTANT).teaching(teaching)
                .overview(overview).build();
        when(chatMessageRepository.findOwnReply(REPLY_ID, PROJECT_ID, USER_ID)).thenReturn(Optional.of(reply));
    }

    private void theTurnWrote() {
        when(chatEventRepository.findWrittenAndSaid(REPLY_ID)).thenReturn(List.of(
                ChatEvent.builder().type(ChatEventType.MESSAGE).content("Starting with the page.").build(),
                ChatEvent.builder().type(ChatEventType.FILE_EDIT).filePath("src/pages/Index.tsx").content(PAGE).build(),
                ChatEvent.builder().type(ChatEventType.FILE_EDIT).filePath("src/App.tsx").content("a\nb\n")
                        .previousContent("a\n").build(),
                ChatEvent.builder().type(ChatEventType.FILE_DELETE).filePath("src/Old.tsx").build()));
    }

    private static ChatResponse piece(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }

    @Test
    @DisplayName("a turn that is not in the caller's own conversation on this project is not found, and nothing is spent")
    void anotherConversationsTurnIsNotFound() {
        when(chatMessageRepository.findOwnReply(REPLY_ID, PROJECT_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, null)))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(chatMessageRepository).findOwnReply(REPLY_ID, PROJECT_ID, USER_ID);
        verifyNoInteractions(usageService, chatClient);
    }

    @Test
    @DisplayName("a turn that was not asked for in teaching mode has no overview")
    void aTurnBuiltWithoutTeachingIsRefused() {
        savedReply(false, null);

        assertThatThrownBy(() -> service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, null)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("teaching mode");

        verifyNoInteractions(usageService, chatClient);
    }

    @Test
    @DisplayName("a turn that wrote no file has nothing to give an overview of, and nothing is spent")
    void aTurnThatWroteNothingIsRefused() {
        savedReply(true, null);
        when(chatEventRepository.findWrittenAndSaid(REPLY_ID)).thenReturn(List.of(
                ChatEvent.builder().type(ChatEventType.MESSAGE).content("It already does that.").build()));

        assertThatThrownBy(() -> service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, null)))
                .isInstanceOf(BadRequestException.class);

        verifyNoInteractions(usageService, chatClient);
    }

    @Test
    @DisplayName("an overview already written is returned as it was kept, without the model or the budget")
    void aKeptOverviewIsReturnedForFree() {
        savedReply(true, "You asked for a notes app.");

        List<String> answer = service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, LearnerLevel.DEVELOPER))
                .collectList().block();

        assertThat(answer).containsExactly("You asked for a notes app.");
        verifyNoInteractions(usageService, chatClient);
        verify(chatMessageRepository, never()).saveOverview(anyLong(), anyString());
    }

    @Test
    @DisplayName("an answer that finishes is charged once, though the web layer cancels the stream it has just seen complete")
    void anAnswerThatFinishesAndIsThenCancelledIsChargedOnce() throws Exception {
        savedReply(true, null);
        theTurnWrote();
        when(chatMessageRepository.findRequestsBefore(eq(PROJECT_ID), eq(USER_ID), eq(REPLY_ID), any()))
                .thenReturn(List.of("a notes app"));
        when(stream.chatResponse()).thenReturn(Flux.just(piece("You asked for notes.")));

        java.util.concurrent.CountDownLatch finished = new java.util.concurrent.CountDownLatch(1);
        service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, LearnerLevel.SOME))
                .subscribe(new reactor.core.publisher.BaseSubscriber<String>() {
                    @Override
                    protected void hookOnComplete() {
                        upstream().cancel();
                        finished.countDown();
                    }
                });

        assertThat(finished.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        verify(aiUsageRecorder, timeout(2000)).reconcile(any(), any(org.springframework.ai.chat.model.ChatResponse.class),
                eq(UsageFeature.EXPLAIN), eq(PROJECT_ID));
        Thread.sleep(300);
        verify(aiUsageRecorder, org.mockito.Mockito.never())
                .reconcileUnfinished(any(), any(), any(), any(), org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    @DisplayName("a new overview is written from the request, what was said, the steps and the paths - no file text - then kept")
    @SuppressWarnings("unchecked")
    void aNewOverviewIsWrittenFromTheTurnAndKept() {
        savedReply(true, null);
        theTurnWrote();
        when(chatMessageRepository.findRequestsBefore(eq(PROJECT_ID), eq(USER_ID), eq(REPLY_ID), any()))
                .thenReturn(List.of("a notes app"));
        when(chatEventRepository.findSteps(REPLY_ID)).thenReturn(List.of(
                ChatEvent.builder().type(ChatEventType.TODO).content("Putting the page together")
                        .filePath("src/pages/Index.tsx").build()));
        when(stream.chatResponse()).thenReturn(Flux.just(piece("You asked for notes.\n\n### The pieces\n"),
                piece("- `src/pages/Index.tsx` - The screen.\n")));

        String answer = String.join("", service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, LearnerLevel.SOME))
                .collectList().block());

        assertThat(answer).startsWith("You asked for notes.").contains("### The pieces");
        verify(usageService).reserveBudget(UsageFeature.EXPLAIN);
        verify(chatMessageRepository, timeout(2000)).saveOverview(REPLY_ID, answer.strip());
        verify(call).tools(any(Object[].class));

        ArgumentCaptor<String> system = ArgumentCaptor.forClass(String.class);
        verify(call).system(system.capture());
        assertThat(system.getValue()).contains("someone who has written a little code");

        ArgumentCaptor<List<Message>> sent = ArgumentCaptor.forClass(List.class);
        verify(call).messages(sent.capture());
        assertThat(sent.getValue()).hasSize(1);
        assertThat(sent.getValue().getFirst().getText())
                .contains("What the person asked for:\na notes app")
                .contains("What the build said about it:\nStarting with the page.")
                .contains("1. Putting the page together (src/pages/Index.tsx)")
                .contains("- src/pages/Index.tsx (new, 3 lines)")
                .contains("- src/App.tsx (changed, 2 lines)")
                .contains("- src/Old.tsx (deleted by this build")
                .doesNotContain("export default function Index");
    }

    @Test
    @DisplayName("an overview whose stream fails part-way is not kept")
    void anOverviewCutShortIsNotKept() {
        savedReply(true, null);
        theTurnWrote();
        when(chatEventRepository.findSteps(REPLY_ID)).thenReturn(List.of());
        when(stream.chatResponse()).thenReturn(Flux.concat(Flux.just(piece("You asked")),
                Flux.error(new IllegalStateException("provider dropped"))));

        assertThatThrownBy(() -> service.streamOverview(PROJECT_ID, new OverviewRequest(REPLY_ID, null)).collectList().block())
                .isInstanceOf(IllegalStateException.class);

        verify(chatMessageRepository, never()).saveOverview(anyLong(), anyString());
    }
}
