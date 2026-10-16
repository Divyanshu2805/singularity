package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileContentDto;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.llm.LlmResponseParser.ParsedEvent;
import com.singularity.intelligence.llm.stub.StubReplies;
import com.singularity.intelligence.repository.ChatSessionRepository;
import com.singularity.intelligence.service.ProjectFileReader;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import feign.FeignException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the demo account's sample build: the brief as the person's message, the notes app's files written whole, the
 * starter page's title edited in place against the stored file, and a build that would not save failing the reset
 * rather than leaving a half-built sample.
 */
class DemoProjectSeederTest {

    private static final long PROJECT_ID = 41L;
    private static final long USER_ID = 9L;
    private static final String TEMPLATE_INDEX = """
            <!doctype html>
            <html lang="en">
              <head>
                <title>New project</title>
              </head>
            </html>
            """;

    private final ChatSessionRepository chatSessionRepository = mock(ChatSessionRepository.class);
    private final ProjectFileReader projectFileReader = mock(ProjectFileReader.class);
    private final TurnRecorder turnRecorder = mock(TurnRecorder.class);
    private final DemoProjectSeeder seeder = new DemoProjectSeeder(chatSessionRepository, new LlmResponseParser(),
            projectFileReader, turnRecorder);

    DemoProjectSeederTest() {
        when(chatSessionRepository.findById(any())).thenReturn(Optional.empty());
        when(chatSessionRepository.save(any(ChatSession.class))).thenAnswer(call -> call.getArgument(0));
        when(projectFileReader.getFileContent(eq(PROJECT_ID), anyString())).thenThrow(FeignException.NotFound.class);
        doReturn(new FileContentDto("index.html", TEMPLATE_INDEX))
                .when(projectFileReader).getFileContent(PROJECT_ID, "index.html");
    }

    @Test
    void recordsTheBriefAndTheNotesAppAsOneSavedTurn() {
        when(turnRecorder.record(any())).thenReturn(TurnOutcome.SAVED);

        seeder.recordFirstBuild(PROJECT_ID, USER_ID);

        ArgumentCaptor<TurnRecord> turn = ArgumentCaptor.forClass(TurnRecord.class);
        verify(turnRecorder).record(turn.capture());
        assertThat(turn.getValue().chatSession().getId()).isEqualTo(new ChatSessionId(PROJECT_ID, USER_ID));
        assertThat(turn.getValue().userMessage()).isEqualTo(StubReplies.demoBrief()).startsWith("**Build:**");

        Map<String, String> files = turn.getValue().events().stream()
                .filter(event -> event.type() == ChatEventType.FILE_EDIT)
                .collect(Collectors.toMap(ParsedEvent::path, ParsedEvent::content));
        assertThat(files).containsKeys("src/lib/notes.ts", "src/components/NoteList.tsx", "src/pages/Index.tsx",
                "index.html");
        assertThat(files.get("index.html")).contains("<title>Quick Notes</title>").doesNotContain("New project");
        assertThat(turn.getValue().events()).noneMatch(event -> event.type() == ChatEventType.FILE_PATCH);
    }

    @Test
    void aBuildThatDidNotSaveFailsTheReset() {
        when(turnRecorder.record(any())).thenReturn(TurnOutcome.NOT_SAVED);

        assertThatThrownBy(() -> seeder.recordFirstBuild(PROJECT_ID, USER_ID))
                .isInstanceOf(ExternalServiceException.class);
    }

    @Test
    void aProjectThatIsNotFreshFromTheTemplateIsRefused() {
        doReturn(new FileContentDto("index.html", "<title>Something else</title>"))
                .when(projectFileReader).getFileContent(PROJECT_ID, "index.html");

        assertThatThrownBy(() -> seeder.recordFirstBuild(PROJECT_ID, USER_ID))
                .isInstanceOf(IllegalStateException.class);
    }
}
