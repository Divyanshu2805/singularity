package com.vibecraft.intelligence.service.impl;

import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.mapper.CodeNoteMapper;
import com.vibecraft.intelligence.repository.CodeNoteRepository;
import com.vibecraft.intelligence.security.AuthUtil;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * The daily token allowance has to be checked before a code-insight call spends anything. The two streamed
 * variants always did that; the non-streaming {@code explain} and {@code ask} did not (in the original monolith either),
 * so a caller already over the limit could keep spending tokens by using them instead. Over budget must throw
 * before the model is so much as touched.
 */
class CodeInsightServiceImplBudgetGateTest {

    private final ChatClient chatClient = mock(ChatClient.class);
    private final UsageService usageService = mock(UsageService.class);

    private final CodeInsightServiceImpl service = new CodeInsightServiceImpl(
            chatClient, mock(AiUsageRecorder.class), mock(WorkspaceServiceClient.class), mock(ProjectFileReader.class),
            usageService, mock(CodeNoteRepository.class), mock(CodeNoteMapper.class), mock(AuthUtil.class));

    private void overBudget() {
        doThrow(new IllegalStateException("over the daily allowance")).when(usageService).assertWithinDailyTokenBudget();
    }

    @Test
    @DisplayName("explain over the daily allowance is refused before the model is called")
    void explainIsGated() {
        overBudget();

        assertThatThrownBy(() -> service.explain(1L, new ExplainCodeRequest("src/App.tsx", "const a = 1;", 1, 1)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("daily allowance");

        verifyNoInteractions(chatClient);
    }

    @Test
    @DisplayName("ask over the daily allowance is refused before the model is called")
    void askIsGated() {
        overBudget();

        assertThatThrownBy(() -> service.ask(1L, new AskCodeRequest(null, null, null, null, "what is this?", List.of())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("daily allowance");

        verifyNoInteractions(chatClient);
    }

    @Test
    @DisplayName("the streamed variants are gated too (they always were - this pins it)")
    void streamedVariantsStayGated() {
        overBudget();

        assertThatThrownBy(() -> service.streamExplain(1L, new ExplainCodeRequest("src/App.tsx", "const a = 1;", 1, 1)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.streamAsk(1L, new AskCodeRequest(null, null, null, null, "what is this?", List.of())))
                .isInstanceOf(IllegalStateException.class);

        verifyNoInteractions(chatClient);
    }
}
