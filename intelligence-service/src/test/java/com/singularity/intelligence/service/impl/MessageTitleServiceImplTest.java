package com.singularity.intelligence.service.impl;

import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.dto.chat.MessageTitlesResponse.MessageTitle;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.ModelCalls;
import com.singularity.intelligence.llm.stub.StubChatModel;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the titles written for a person's chat messages.
 *
 * <p>The service must title the caller's untitled messages oldest first in one model call charged as project naming,
 * store each only while its message has none and answer with what it stored; spend nothing when nothing is untitled;
 * and answer empty - never an error - when the allowance is spent or the provider fails, giving the held allowance
 * back. The messages reach the model only as a user message. The model is the scripted one.
 */
class MessageTitleServiceImplTest {

    private static final long PROJECT_ID = 42L;
    private static final long USER_ID = 7L;

    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final UsageService usageService = mock(UsageService.class);
    private final AiUsageRecorder usageRecorder = mock(AiUsageRecorder.class);
    private final AtomicReference<Prompt> sent = new AtomicReference<>();
    private final UsageReservation reservation = new UsageReservation(USER_ID, LocalDate.now(), 2_000);

    private MessageTitleServiceImpl service(ChatModel model) {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(usageService.reserveBudget(UsageFeature.PROJECT_NAMING)).thenReturn(reservation);
        when(messages.setTitleIfUntitled(anyLong(), anyString())).thenReturn(1);
        return new MessageTitleServiceImpl(authUtil, messages, usageService, usageRecorder,
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

    private void untitledNewestFirst(ChatMessage... newestFirst) {
        when(messages.findUntitledRequests(eq(PROJECT_ID), eq(USER_ID), any())).thenReturn(List.of(newestFirst));
    }

    private static ChatMessage asked(long id, String content) {
        return ChatMessage.builder().id(id).role(MessageRole.USER).content(content).build();
    }

    @Test
    void untitledMessagesAreTitledOldestFirstInOneCallAndStored() {
        untitledNewestFirst(asked(12, "change name to Divyanshus notes"), asked(10, "**Build:** A minimalist notes app"));

        List<MessageTitle> titles = service(scripted()).titleMessages(PROJECT_ID);

        assertThat(titles).containsExactly(
                new MessageTitle(10L, "Build a quick notes app"),
                new MessageTitle(12L, "Change the notes app, part 2"));
        verify(messages).setTitleIfUntitled(10L, "Build a quick notes app");
        verify(usageRecorder).reconcile(eq(reservation), any(ChatResponse.class), eq(UsageFeature.PROJECT_NAMING), eq(PROJECT_ID));
    }

    @Test
    void theMessagesReachTheModelOnlyAsAUserMessage() {
        untitledNewestFirst(asked(10, "a notes app for jotting things down"));

        service(scripted()).titleMessages(PROJECT_ID);

        List<Message> instructions = sent.get().getInstructions();
        assertThat(instructions).filteredOn(message -> message.getMessageType() == MessageType.SYSTEM)
                .allSatisfy(message -> assertThat(message.getText()).doesNotContain("jotting"));
        assertThat(instructions).filteredOn(message -> message.getMessageType() == MessageType.USER)
                .anySatisfy(message -> assertThat(message.getText()).contains("1. a notes app for jotting things down"));
    }

    @Test
    void aTitleAnotherTabStoredFirstIsNotReported() {
        untitledNewestFirst(asked(10, "a notes app"));
        MessageTitleServiceImpl service = service(scripted());
        when(messages.setTitleIfUntitled(anyLong(), anyString())).thenReturn(0);

        assertThat(service.titleMessages(PROJECT_ID)).isEmpty();
    }

    @Test
    void nothingUntitledSpendsNothing() {
        untitledNewestFirst(asked(10, "   "));

        assertThat(service(scripted()).titleMessages(PROJECT_ID)).isEmpty();

        verify(usageService, never()).reserveBudget(any());
        assertThat(sent.get()).isNull();
    }

    @Test
    void withNoAllowanceLeftTheModelIsNotAsked() {
        untitledNewestFirst(asked(10, "a notes app"));
        MessageTitleServiceImpl service = service(scripted());
        when(usageService.reserveBudget(UsageFeature.PROJECT_NAMING)).thenThrow(mock(QuotaExceededException.class));

        assertThat(service.titleMessages(PROJECT_ID)).isEmpty();

        assertThat(sent.get()).isNull();
    }

    @Test
    void aProviderThatFailsGivesNoTitlesAndTheHeldAllowanceBack() {
        untitledNewestFirst(asked(10, "a notes app"));
        ChatModel failing = prompt -> {
            throw new IllegalStateException("provider down");
        };

        assertThat(service(failing).titleMessages(PROJECT_ID)).isEmpty();

        verify(usageRecorder).release(reservation);
        verify(messages, never()).setTitleIfUntitled(anyLong(), anyString());
    }
}
