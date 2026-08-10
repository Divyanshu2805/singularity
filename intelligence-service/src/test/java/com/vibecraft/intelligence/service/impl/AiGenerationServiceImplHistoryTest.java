package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.entity.ChatMessage;
import com.vibecraft.intelligence.entity.ChatSession;
import com.vibecraft.intelligence.entity.ChatSessionId;
import com.vibecraft.intelligence.enums.ChatEventType;
import com.vibecraft.intelligence.enums.MessageRole;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.LlmResponseParser;
import com.vibecraft.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
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
}
