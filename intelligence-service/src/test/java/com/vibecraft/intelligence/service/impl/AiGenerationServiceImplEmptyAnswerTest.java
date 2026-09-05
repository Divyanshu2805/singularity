package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.ProjectMembershipDto;
import com.vibecraft.common.dto.ProjectRole;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.entity.ChatSession;
import com.vibecraft.intelligence.entity.ChatSessionId;
import com.vibecraft.intelligence.enums.ChatEventType;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.LlmResponseParser;
import com.vibecraft.intelligence.llm.TeachingMode;
import com.vibecraft.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import reactor.core.publisher.Flux;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers a build turn whose model call came back with no text at all - seen in production from {@code x-ai/grok-4.5}
 * on a brand-new project's first build: no unrecognized text either, so the parser found nothing, and the turn used
 * to be saved as a lone "Worked for Ns" line that looked exactly like a successful no-op. It is now retried once
 * like an abandoned edit, and saved with an explicit notice if the retry is empty too.
 */
class AiGenerationServiceImplEmptyAnswerTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 10L;

    private final ChatClient chatClient = mock(ChatClient.class);
    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);
    private final ChatEventRepository chatEventRepository = mock(ChatEventRepository.class);
    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);

    private final AiGenerationServiceImpl service = new AiGenerationServiceImpl(
            chatClient, mock(AuthUtil.class), workspaceServiceClient, mock(ProjectFileReader.class),
            mock(FileTreeContextAdvisor.class), mock(ChatSessionRepository.class), new LlmResponseParser(),
            chatMessageRepository, chatEventRepository, mock(UsageService.class), mock(AiUsageRecorder.class),
            new GenerationRegistry());

    private final ChatSession chatSession = ChatSession.builder().id(new ChatSessionId(PROJECT_ID, USER_ID)).build();

    AiGenerationServiceImplEmptyAnswerTest() {
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(call -> call.getArgument(0));
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.OWNER));
    }

    /**
     * A ChatClient whose whole fluent chain (prompt().system().messages().tools().advisors().stream()) resolves to
     * one stream returning {@code retryAnswer}: every builder method hands back the same spec, so the test never
     * depends on which overloads the service happens to call.
     */
    private void retryReturns(Flux<ChatResponse> retryAnswer) {
        ChatClient.StreamResponseSpec stream = mock(ChatClient.StreamResponseSpec.class);
        when(stream.chatResponse()).thenReturn(retryAnswer);

        ChatClient.ChatClientRequestSpec request = mock(ChatClient.ChatClientRequestSpec.class, call -> {
            Class<?> returned = call.getMethod().getReturnType();
            if (returned.isInstance(call.getMock())) {
                return call.getMock();
            }
            return returned == ChatClient.StreamResponseSpec.class ? stream : null;
        });
        when(chatClient.prompt()).thenReturn(request);
    }

    private ChatResponse answer(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }

    @SuppressWarnings("unchecked")
    private List<ChatEvent> savedEvents() {
        ArgumentCaptor<List<ChatEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(chatEventRepository).saveAll(captor.capture());
        return captor.getValue();
    }

    private void finalizeWith(String modelText) {
        service.finalizeChats("build a sequence game", chatSession, modelText, 15L, null, TeachingMode.off(), "stop",
                null, List.of());
    }

    @Test
    void anEmptyAnswerThatStaysEmptyIsSavedWithAnExplicitNoticeInsteadOfALoneWorkedForLine() {
        retryReturns(Flux.empty());

        finalizeWith("");

        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.THOUGHT, ChatEventType.MESSAGE);
        assertThat(events.get(0).getContent()).contains("retried once");
        assertThat(events.get(1).getContent()).isEqualTo(AiGenerationServiceImpl.EMPTY_ANSWER_NOTICE);
        verify(chatClient, times(1)).prompt();
    }

    @Test
    void anEmptyAnswerIsReplacedByTheRetrysAnswerWhenTheRetryComesBackWithContent() {
        retryReturns(Flux.just(answer("<message>Building the Sequence board now.</message>")));

        finalizeWith("");

        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.THOUGHT, ChatEventType.MESSAGE);
        assertThat(events.get(1).getContent()).isEqualTo("Building the Sequence board now.");
    }

    @Test
    void anAnswerThatParsedToSomethingIsNeverRetried() {
        finalizeWith("<message>All done.</message>");

        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).containsExactly(ChatEventType.THOUGHT, ChatEventType.MESSAGE);
        assertThat(events.get(1).getContent()).isEqualTo("All done.");
        verify(chatClient, never()).prompt();
    }
}
