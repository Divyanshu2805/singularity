package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.common.security.AuthUtil;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.enums.ChatEventType;
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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers CODE_REVIEW.md AI-05's rewritten {@code commitFileChanges}: a turn's file changes publish as one atomic
 * {@code publishRevision} call, all-or-nothing, instead of the previous one-Feign-call-per-file loop. This
 * supersedes the old per-file partial-success tests this class used to carry - the actual atomicity/rollback
 * behavior AI-05's "Done when" describes is now proven against workspace-service's real logic in
 * {@code RevisionPublisherImplTest}/{@code RevisionPublisherIntegrationTest}; this class only proves
 * {@code AiGenerationServiceImpl} builds the right request and interprets the response correctly.
 */
class AiGenerationServiceImplCommitTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;

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

    @Test
    void buildsOneRevisionRequestForEveryChangeInTheTurn() {
        List<ChatEvent> events = List.of(fileEdit("a.tsx", "content a"), fileDelete("old.tsx"));
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenReturn(
                new PublishRevisionResponse(10L, PublishRevisionResponse.Status.APPLIED, 10L, List.of(), Map.of()));

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
        assertThat(response.failedPaths()).isEmpty();

        PublishRevisionRequest request = captureRequest();
        assertThat(request.expectedParentRevisionId()).isNull();
        assertThat(request.createdByUserId()).isEqualTo(USER_ID);
        assertThat(request.source()).isEqualTo("AI_GENERATION");
        assertThat(request.changes()).containsExactly(
                new FileChangeDto("a.tsx", FileChangeDto.ChangeType.EDIT, "content a"),
                new FileChangeDto("old.tsx", FileChangeDto.ChangeType.DELETE, null));
        verify(workspaceServiceClient, times(1)).publishRevision(eq(PROJECT_ID), any());
    }

    @Test
    void anAppliedResponseReportsNoFailures() {
        List<ChatEvent> events = List.of(fileEdit("a.tsx", "content"));
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenReturn(
                new PublishRevisionResponse(1L, PublishRevisionResponse.Status.APPLIED, 1L, List.of(),
                        Map.of("a.tsx", "")));

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
        assertThat(response.failedPaths()).isEmpty();
    }

    @Test
    void aFailedResponseReportsEveryChangedPathAsFailed_notJustTheBrokenOne() {
        List<ChatEvent> events = List.of(fileEdit("New.tsx", "moved content"), fileDelete("Old.tsx"));
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenReturn(
                new PublishRevisionResponse(2L, PublishRevisionResponse.Status.FAILED, null,
                        List.of("New.tsx", "Old.tsx"), Map.of("New.tsx", "", "Old.tsx", "old content")));

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.FAILED);
        assertThat(response.failedPaths()).containsExactlyInAnyOrder("New.tsx", "Old.tsx");
    }

    @Test
    void aConflictResponseIsSurfacedTheSameWayAsAFailure() {
        List<ChatEvent> events = List.of(fileEdit("a.tsx", "content"));
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenReturn(
                new PublishRevisionResponse(null, PublishRevisionResponse.Status.CONFLICT, 5L,
                        List.of("a.tsx"), Map.of()));

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.CONFLICT);
        assertThat(response.failedPaths()).containsExactly("a.tsx");
    }

    @Test
    void anUnreachableWorkspaceServiceIsReportedAsFailedForEveryChangedPath() {
        List<ChatEvent> events = List.of(fileEdit("a.tsx", "content"), fileDelete("b.tsx"));
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenThrow(new RuntimeException("connection refused"));

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.FAILED);
        assertThat(response.failedPaths()).containsExactlyInAnyOrder("a.tsx", "b.tsx");
    }

    @Test
    void aTurnWithNoFileChangesNeverCallsPublishRevision() {
        List<ChatEvent> events = List.of(ChatEvent.builder().type(ChatEventType.MESSAGE).content("hi").build());

        PublishRevisionResponse response = service.commitFileChanges(events, PROJECT_ID, USER_ID);

        assertThat(response.status()).isEqualTo(PublishRevisionResponse.Status.APPLIED);
        assertThat(response.failedPaths()).isEmpty();
        verify(workspaceServiceClient, times(0)).publishRevision(any(), any());
    }

    private PublishRevisionRequest captureRequest() {
        var captor = org.mockito.ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(workspaceServiceClient).publishRevision(eq(PROJECT_ID), captor.capture());
        return captor.getValue();
    }
}
