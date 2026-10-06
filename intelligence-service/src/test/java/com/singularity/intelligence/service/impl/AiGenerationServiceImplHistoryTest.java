package com.singularity.intelligence.service.impl;

import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.UsageService;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.UserMessage;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-01: a build turn used to see only the current message, with no memory of what was
 * decided or built earlier in the same project chat - "use option two" after an earlier comparison had nothing to
 * resolve it against. Recent turns are now replayed, condensed rather than verbatim, and bounded so a long-running
 * project chat cannot grow the prompt without limit.
 */
class AiGenerationServiceImplHistoryTest {

    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);

    private final AiGenerationServiceImpl service = new AiGenerationServiceImpl(
            mock(ChatClient.class), mock(AuthUtil.class), mock(WorkspaceServiceClient.class), mock(ProjectFileReader.class),
            mock(FileTreeContextAdvisor.class), mock(ChatSessionRepository.class), mock(LlmResponseParser.class),
            chatMessageRepository, mock(ChatEventRepository.class), mock(UsageService.class), mock(AiUsageRecorder.class),
            new GenerationRegistry());

    private final ChatSession chatSession = ChatSession.builder().id(new ChatSessionId(1L, 10L)).build();

    private ChatMessage userTurn(String content) {
        return ChatMessage.builder().role(MessageRole.USER).content(content).build();
    }

    private ChatMessage assistantTurn(ChatEvent... events) {
        ChatMessage message = ChatMessage.builder().role(MessageRole.ASSISTANT).build();
        message.setEvents(List.of(events));
        return message;
    }

    private ChatEvent messageEvent(String content) {
        return ChatEvent.builder().type(ChatEventType.MESSAGE).content(content).build();
    }

    private ChatEvent fileEditEvent(String path) {
        return ChatEvent.builder().type(ChatEventType.FILE_EDIT).filePath(path).build();
    }

    @Test
    void replaysAUserTurnAsIs() {
        when(chatMessageRepository.findByChatSession(chatSession)).thenReturn(List.of(userTurn("build a login form")));

        List<Message> history = service.recentHistory(chatSession);

        assertThat(history).hasSize(1);
        assertThat(history.getFirst()).isInstanceOf(UserMessage.class);
        assertThat(history.getFirst().getText()).isEqualTo("build a login form");
    }

    @Test
    void condensesAnAssistantTurnToWhatItSaidAndWhichFilesItTouchedNotTheFileBodies() {
        ChatMessage assistant = assistantTurn(
                messageEvent("I'll add a login form."),
                fileEditEvent("src/LoginForm.tsx"),
                fileEditEvent("src/App.tsx"));
        when(chatMessageRepository.findByChatSession(chatSession)).thenReturn(List.of(assistant));

        List<Message> history = service.recentHistory(chatSession);

        assertThat(history).hasSize(1);
        assertThat(history.getFirst()).isInstanceOf(AssistantMessage.class);
        assertThat(history.getFirst().getText())
                .isEqualTo("I'll add a login form. (Files touched: src/LoginForm.tsx, src/App.tsx)");
    }

    @Test
    void anAssistantTurnWithNoMessageEventsStillNamesTheFilesItTouched() {
        ChatMessage assistant = assistantTurn(fileEditEvent("src/App.tsx"));
        when(chatMessageRepository.findByChatSession(chatSession)).thenReturn(List.of(assistant));

        List<Message> history = service.recentHistory(chatSession);

        assertThat(history.getFirst().getText()).isEqualTo("(Files touched: src/App.tsx)");
    }

    @Test
    void anAssistantTurnWithNothingWorthReplayingIsSkippedEntirely() {
        ChatMessage emptyAssistantTurn = assistantTurn();
        when(chatMessageRepository.findByChatSession(chatSession)).thenReturn(List.of(emptyAssistantTurn));

        assertThat(service.recentHistory(chatSession)).isEmpty();
    }

    @Test
    void isBoundedToTheMostRecentTurnsOnly() {
        List<ChatMessage> turns = new ArrayList<>();
        for (int i = 0; i < 30; i++) {
            turns.add(userTurn("turn " + i));
        }
        when(chatMessageRepository.findByChatSession(chatSession)).thenReturn(turns);

        List<Message> history = service.recentHistory(chatSession);

        assertThat(history).hasSizeLessThanOrEqualTo(20);
        assertThat(history.getLast().getText()).isEqualTo("turn 29");
        assertThat(history.getFirst().getText()).isNotEqualTo("turn 0");
    }

    @Test
    void aQuestionTheModelAskedIsReplayedSoTheUsersAnswerHasSomethingToAnswer() {
        ChatMessage asked = assistantTurn(
                messageEvent("I need one thing first."),
                ChatEvent.builder().type(ChatEventType.ASK).content("How should people sign in?")
                        .metadata("Email and password|Google sign-in only").build());
        when(chatMessageRepository.findByChatSession(chatSession))
                .thenReturn(List.of(userTurn("add accounts"), asked, userTurn("Google sign-in only")));

        List<Message> history = service.recentHistory(chatSession);

        assertThat(history).hasSize(3);
        assertThat(history.get(1)).isInstanceOf(AssistantMessage.class);
        assertThat(history.get(1).getText())
                .contains("I need one thing first.")
                .contains("You asked the user: How should people sign in?");
        assertThat(history.get(2).getText()).isEqualTo("Google sign-in only");
    }
}
