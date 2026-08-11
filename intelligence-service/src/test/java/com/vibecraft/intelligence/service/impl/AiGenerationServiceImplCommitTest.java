package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.intelligence.entity.ChatEvent;
import com.vibecraft.intelligence.enums.ChatEventType;
import com.vibecraft.intelligence.feign.WorkspaceServiceClient;
import com.vibecraft.intelligence.llm.AiUsageRecorder;
import com.vibecraft.intelligence.llm.LlmResponseParser;
import com.vibecraft.intelligence.llm.advisors.FileTreeContextAdvisor;
import com.vibecraft.intelligence.repository.ChatEventRepository;
import com.vibecraft.intelligence.repository.ChatMessageRepository;
import com.vibecraft.intelligence.repository.ChatSessionRepository;
import com.vibecraft.intelligence.service.ProjectFileReader;
import com.vibecraft.intelligence.service.UsageService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-04 and AI-05's concrete, named bugs: a failed save must never be recorded as if it
 * succeeded (AI-04), and a rename - written as a new file plus a delete of the old path, with nothing marking them
 * as a pair - must not delete the old file when the new one failed to save (AI-05). This does not implement either
 * finding's full "Done when" (an explicit generating/committing/failed state machine driving the UI, or a staged,
 * atomically-published revision with rollback data) - see CODE_REVIEW.md for what was and wasn't attempted.
 */
class AiGenerationServiceImplCommitTest {

    private static final long PROJECT_ID = 1L;

    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);

    private final AiGenerationServiceImpl service = new AiGenerationServiceImpl(
            mock(ChatClient.class), mock(AuthUtil.class), workspaceServiceClient, mock(ProjectFileReader.class),
            mock(FileTreeContextAdvisor.class), mock(ChatSessionRepository.class), mock(LlmResponseParser.class),
            mock(ChatMessageRepository.class), mock(ChatEventRepository.class), mock(UsageService.class),
            mock(AiUsageRecorder.class), new GenerationRegistry());

    private ChatEvent fileEdit(String path, String content) {
        return ChatEvent.builder().type(ChatEventType.FILE_EDIT).filePath(path).content(content).build();
    }

    private ChatEvent fileDelete(String path) {
        return ChatEvent.builder().type(ChatEventType.FILE_DELETE).filePath(path).content("reason").build();
    }

    @BeforeEach
    void stubPreviousContentLookup() {
        when(workspaceServiceClient.getFileContent(eq(PROJECT_ID), anyString())).thenReturn(new FileContentDto("", ""));
    }

    @Test
    void everySaveAndDeleteSucceedingReturnsNoFailures() {
        List<ChatEvent> events = List.of(fileEdit("a.tsx", "content a"), fileDelete("old.tsx"));

        Set<String> failed = service.commitFileChanges(events, PROJECT_ID);

        assertThat(failed).isEmpty();
        verify(workspaceServiceClient).saveFile(eq(PROJECT_ID), eq(new FileContentDto("a.tsx", "content a")));
        verify(workspaceServiceClient).deleteFile(PROJECT_ID, "old.tsx");
    }

    @Test
    void aFailedSaveIsReportedButDoesNotStopOtherFilesFromSaving() {
        doThrow(new RuntimeException("storage unavailable"))
                .when(workspaceServiceClient).saveFile(eq(PROJECT_ID), eq(new FileContentDto("broken.tsx", "x")));
        List<ChatEvent> events = List.of(fileEdit("broken.tsx", "x"), fileEdit("fine.tsx", "y"));

        Set<String> failed = service.commitFileChanges(events, PROJECT_ID);

        assertThat(failed).containsExactly("broken.tsx");
        verify(workspaceServiceClient).saveFile(eq(PROJECT_ID), eq(new FileContentDto("fine.tsx", "y")));
    }

    @Test
    void aRenameWhoseNewFileFailedToSaveDoesNotDeleteTheOldFile() {
        doThrow(new RuntimeException("storage unavailable"))
                .when(workspaceServiceClient).saveFile(eq(PROJECT_ID), eq(new FileContentDto("New.tsx", "moved content")));
        List<ChatEvent> events = List.of(fileEdit("New.tsx", "moved content"), fileDelete("Old.tsx"));

        Set<String> failed = service.commitFileChanges(events, PROJECT_ID);

        assertThat(failed).containsExactlyInAnyOrder("New.tsx", "Old.tsx");
        verify(workspaceServiceClient, never()).deleteFile(eq(PROJECT_ID), any());
    }

    @Test
    void deletesStillRunNormallyWhenNoEditFailedThisTurn() {
        List<ChatEvent> events = List.of(fileEdit("New.tsx", "moved content"), fileDelete("Old.tsx"));

        Set<String> failed = service.commitFileChanges(events, PROJECT_ID);

        assertThat(failed).isEmpty();
        verify(workspaceServiceClient).deleteFile(PROJECT_ID, "Old.tsx");
    }

    @Test
    void aFailedDeleteOnItsOwnIsReportedWithoutAffectingUnrelatedEdits() {
        doThrow(new RuntimeException("not found")).when(workspaceServiceClient).deleteFile(PROJECT_ID, "gone.tsx");
        List<ChatEvent> events = List.of(fileEdit("kept.tsx", "z"), fileDelete("gone.tsx"));

        Set<String> failed = service.commitFileChanges(events, PROJECT_ID);

        assertThat(failed).containsExactly("gone.tsx");
        verify(workspaceServiceClient).saveFile(eq(PROJECT_ID), eq(new FileContentDto("kept.tsx", "z")));
    }
}
