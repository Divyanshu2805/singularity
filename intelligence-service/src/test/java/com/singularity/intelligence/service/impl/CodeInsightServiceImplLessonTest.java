package com.singularity.intelligence.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.dto.code.LessonRequest;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.UsageFeature;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.AiUsageRecorder;
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
 * Covers teaching mode's lesson on a step: it is written only for a file edit in the caller's own conversation, only
 * when that turn was asked for in teaching mode, from what the step changed rather than from its whole file, and once
 * - the finished lesson is kept and returned afterwards without the model or the budget being touched.
 */
class CodeInsightServiceImplLessonTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;
    private static final long EVENT_ID = 55L;
    private static final long REPLY_ID = 21L;

    private static final String BEFORE = "export function Nav() {\n  return <nav />;\n}\n";
    private static final String AFTER = "export function Nav() {\n  const [theme, setTheme] = useState('dark');\n  return <nav />;\n}\n";

    private final ChatClient chatClient = mock(ChatClient.class);
    private final ChatClient.ChatClientRequestSpec call = mock(ChatClient.ChatClientRequestSpec.class);
    private final ChatClient.StreamResponseSpec stream = mock(ChatClient.StreamResponseSpec.class);
    private final UsageService usageService = mock(UsageService.class);
    private final ChatEventRepository chatEventRepository = mock(ChatEventRepository.class);
    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);

    private final CodeInsightServiceImpl service = new CodeInsightServiceImpl(
            chatClient, new com.singularity.intelligence.llm.ModelCalls(com.singularity.intelligence.config.AiCallProperties.defaults()), mock(AiUsageRecorder.class), mock(WorkspaceServiceClient.class), mock(ProjectFileReader.class),
            usageService, mock(CodeNoteRepository.class), chatEventRepository, chatMessageRepository,
            mock(CodeNoteMapper.class), authUtil,
            mock(com.singularity.intelligence.repository.ProjectTourRepository.class),
            mock(com.singularity.intelligence.repository.GlossaryEntryRepository.class));

    CodeInsightServiceImplLessonTest() {
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(chatClient.prompt()).thenReturn(call);
        when(call.system(anyString())).thenReturn(call);
        when(call.messages(anyList())).thenReturn(call);
        when(call.options(any())).thenReturn(call);
        when(call.stream()).thenReturn(stream);
    }

    private ChatEvent savedEdit(boolean teaching, String lesson) {
        ChatMessage reply = ChatMessage.builder().id(REPLY_ID).role(MessageRole.ASSISTANT).teaching(teaching).build();
        ChatEvent edit = ChatEvent.builder().id(EVENT_ID).chatMessage(reply).type(ChatEventType.FILE_EDIT)
                .filePath("src/Nav.tsx").content(AFTER).previousContent(BEFORE).lesson(lesson).build();
        when(chatEventRepository.findOwnFileEdit(EVENT_ID, PROJECT_ID, USER_ID)).thenReturn(Optional.of(edit));
        return edit;
    }

    private static ChatResponse piece(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }

    @Test
    @DisplayName("a step that is not in the caller's own conversation on this project is not found, and nothing is spent")
    void anotherConversationsStepIsNotFound() {
        when(chatEventRepository.findOwnFileEdit(EVENT_ID, PROJECT_ID, USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.streamLesson(PROJECT_ID, new LessonRequest(EVENT_ID)))
                .isInstanceOf(ResourceNotFoundException.class);

        verify(chatEventRepository).findOwnFileEdit(EVENT_ID, PROJECT_ID, USER_ID);
        verifyNoInteractions(usageService, chatClient);
    }

    @Test
    @DisplayName("a step of a turn that was not asked for in teaching mode has no lesson")
    void aTurnBuiltWithoutTeachingIsRefused() {
        savedEdit(false, null);

        assertThatThrownBy(() -> service.streamLesson(PROJECT_ID, new LessonRequest(EVENT_ID)))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("teaching mode");

        verifyNoInteractions(usageService, chatClient);
    }

    @Test
    @DisplayName("a lesson already written is returned as it was kept, without the model or the budget")
    void aKeptLessonIsReturnedForFree() {
        savedEdit(true, "The toggle needs somewhere to remember the theme.");

        List<String> answer = service.streamLesson(PROJECT_ID, new LessonRequest(EVENT_ID)).collectList().block();

        assertThat(answer).containsExactly("The toggle needs somewhere to remember the theme.");
        verifyNoInteractions(usageService, chatClient);
        verify(chatEventRepository, never()).saveLesson(anyLong(), anyString());
    }

    @Test
    @DisplayName("a new lesson is written from the request, the turn's steps and the changed lines, then kept on the step")
    @SuppressWarnings("unchecked")
    void aNewLessonIsWrittenFromTheChangeAndKept() {
        savedEdit(true, null);
        when(chatMessageRepository.findRequestsBefore(eq(PROJECT_ID), eq(USER_ID), eq(REPLY_ID), any()))
                .thenReturn(List.of("add a theme toggle"));
        when(chatEventRepository.findSteps(REPLY_ID)).thenReturn(List.of(
                ChatEvent.builder().type(ChatEventType.TODO).content("Add the toggle").filePath("src/Nav.tsx").build()));
        when(stream.chatResponse()).thenReturn(Flux.just(piece("You asked for a toggle.\n\n### L2 · Remembering"), piece(" the theme\nIt keeps it.\n")));

        String answer = String.join("", service.streamLesson(PROJECT_ID, new LessonRequest(EVENT_ID)).collectList().block());

        assertThat(answer).isEqualTo("You asked for a toggle.\n\n### L2 · Remembering the theme\nIt keeps it.\n");
        verify(usageService).reserveBudget(UsageFeature.EXPLAIN);
        verify(chatEventRepository, timeout(2000)).saveLesson(EVENT_ID, answer.strip());

        ArgumentCaptor<List<Message>> sent = ArgumentCaptor.forClass(List.class);
        verify(call).messages(sent.capture());
        assertThat(sent.getValue()).hasSize(1);
        assertThat(sent.getValue().getFirst().getText())
                .contains("What the person asked for:\nadd a theme toggle")
                .contains("1. Add the toggle (src/Nav.tsx)   <- this lesson")
                .contains("+ 2 |   const [theme, setTheme] = useState('dark');")
                .contains("This step changed src/Nav.tsx, which already existed");
    }

    @Test
    @DisplayName("a lesson whose stream fails part-way is not kept")
    void aLessonCutShortIsNotKept() {
        savedEdit(true, null);
        when(chatEventRepository.findSteps(REPLY_ID)).thenReturn(List.of());
        when(stream.chatResponse()).thenReturn(Flux.concat(Flux.just(piece("You asked")), Flux.error(new IllegalStateException("provider dropped"))));

        assertThatThrownBy(() -> service.streamLesson(PROJECT_ID, new LessonRequest(EVENT_ID)).collectList().block())
                .isInstanceOf(IllegalStateException.class);

        verify(chatEventRepository, never()).saveLesson(anyLong(), anyString());
    }
}
