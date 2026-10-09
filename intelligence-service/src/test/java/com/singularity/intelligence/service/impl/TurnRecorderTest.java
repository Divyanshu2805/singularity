package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.common.dto.ProjectMembershipDto;
import com.singularity.common.dto.ProjectRole;
import com.singularity.common.dto.PublishRevisionRequest;
import com.singularity.common.dto.PublishRevisionResponse;
import com.singularity.intelligence.entity.ChatEvent;
import com.singularity.intelligence.entity.ChatMessage;
import com.singularity.intelligence.entity.ChatSession;
import com.singularity.intelligence.entity.ChatSessionId;
import com.singularity.intelligence.enums.ChatEventType;
import com.singularity.intelligence.enums.MessageRole;
import com.singularity.intelligence.enums.TurnOutcome;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.LlmResponseParser;
import com.singularity.intelligence.repository.ChatEventRepository;
import com.singularity.intelligence.repository.ChatMessageRepository;
import com.singularity.intelligence.service.impl.TurnRecorder.TurnRecord;
import feign.FeignException;
import feign.Request;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers saving a finished build turn: the one atomic revision its files publish as (CODE_REVIEW.md AI-05), what the
 * conversation record says when that revision does not land, and the endings that must be recorded without saving
 * any file at all.
 *
 * <p>A stopped or failed turn used to leave nothing on the server. It is recorded now, with what was said and a note,
 * and its file changes are dropped before anything is published.
 */
class TurnRecorderTest {

    private static final long PROJECT_ID = 1L;
    private static final long USER_ID = 7L;

    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final ChatMessageRepository chatMessageRepository = mock(ChatMessageRepository.class);
    private final ChatEventRepository chatEventRepository = mock(ChatEventRepository.class);
    private final LlmResponseParser parser = new LlmResponseParser();

    private final TurnRecorder recorder = new TurnRecorder(workspaceServiceClient, chatMessageRepository,
            chatEventRepository, parser);

    private final ChatSession chatSession = ChatSession.builder().id(new ChatSessionId(PROJECT_ID, USER_ID)).build();

    TurnRecorderTest() {
        when(chatMessageRepository.save(any(ChatMessage.class))).thenAnswer(call -> call.getArgument(0));
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.OWNER));
    }

    private static final String TWO_CHANGES = """
            <message>Renaming the page.</message>
            <todo path="src/New.tsx">Moving the page</todo>
            <file path="src/New.tsx">export default function New() { return null; }</file>
            <delete path="src/Old.tsx">Replaced by New.tsx</delete>
            <message>Done.</message>
            """;

    private TurnOutcome record(String answer, TurnOutcome outcome, String... notices) {
        return recorder.record(new TurnRecord(chatSession, "rename the page", parser.parse(answer).events(), outcome,
                List.of(notices), 39, 1200, 300));
    }

    @SuppressWarnings("unchecked")
    private List<ChatEvent> savedEvents() {
        ArgumentCaptor<List<ChatEvent>> captor = ArgumentCaptor.forClass(List.class);
        verify(chatEventRepository).saveAll(captor.capture());
        return captor.getValue();
    }

    private PublishRevisionRequest publishedRequest() {
        ArgumentCaptor<PublishRevisionRequest> captor = ArgumentCaptor.forClass(PublishRevisionRequest.class);
        verify(workspaceServiceClient).publishRevision(eq(PROJECT_ID), captor.capture());
        return captor.getValue();
    }

    private void publishAnswers(PublishRevisionResponse.Status status, Map<String, String> previousContent) {
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenReturn(new PublishRevisionResponse(
                10L, status, 10L, status == PublishRevisionResponse.Status.APPLIED ? List.of() : List.of("src/New.tsx", "src/Old.tsx"),
                previousContent));
    }

    @Test
    void everyChangeInTheTurnGoesInOneRevisionAndTheTurnIsRecordedAsSaved() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of("src/New.tsx", "", "src/Old.tsx", "old page"));

        TurnOutcome outcome = record(TWO_CHANGES, null);

        assertThat(outcome).isEqualTo(TurnOutcome.SAVED);
        PublishRevisionRequest request = publishedRequest();
        assertThat(request.expectedParentRevisionId()).isNull();
        assertThat(request.createdByUserId()).isEqualTo(USER_ID);
        assertThat(request.source()).isEqualTo("AI_GENERATION");
        assertThat(request.changes()).containsExactly(
                new FileChangeDto("src/New.tsx", FileChangeDto.ChangeType.EDIT, "export default function New() { return null; }\n"),
                new FileChangeDto("src/Old.tsx", FileChangeDto.ChangeType.DELETE, null));
        verify(workspaceServiceClient, times(1)).publishRevision(eq(PROJECT_ID), any());
    }

    @Test
    void theRecordOpensWithHowLongItTookAndHowItEndedThenTheEventsInOrder() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of("src/New.tsx", "before"));

        record(TWO_CHANGES, null);

        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.THOUGHT, ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.FILE_EDIT,
                ChatEventType.FILE_DELETE, ChatEventType.MESSAGE);
        assertThat(events).extracting(ChatEvent::getSequenceOrder).containsExactly(0, 1, 2, 3, 4, 5);
        assertThat(events.getFirst().getContent()).isEqualTo("Worked for 39s");
        assertThat(events.getFirst().getMetadata()).isEqualTo("SAVED");
        assertThat(events.get(3).getPreviousContent()).isEqualTo("before");
    }

    @Test
    void aRevisionThatLandedWithoutThePreviousVersionsIsStillRecordedAsSaved() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, null);

        assertThat(record(TWO_CHANGES, null)).isEqualTo(TurnOutcome.SAVED);

        assertThat(savedEvents()).filteredOn(event -> event.getType() == ChatEventType.FILE_EDIT)
                .singleElement().satisfies(event -> assertThat(event.getPreviousContent()).isNull());
    }

    @Test
    void aSavedTurnRecordsTheRevisionItsFilesWerePublishedAs() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        record(TWO_CHANGES, null);

        ArgumentCaptor<ChatMessage> captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository, times(3)).save(captor.capture());
        assertThat(captor.getAllValues().get(2).getRole()).isEqualTo(MessageRole.ASSISTANT);
        assertThat(captor.getAllValues().get(2).getRevisionId()).isEqualTo(10L);
    }

    @Test
    void aTurnWhoseFilesDidNotLandRecordsNoRevision() {
        publishAnswers(PublishRevisionResponse.Status.FAILED, Map.of());

        record(TWO_CHANGES, null);

        ArgumentCaptor<ChatMessage> captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues()).allSatisfy(message -> assertThat(message.getRevisionId()).isNull());
    }

    @Test
    void bothMessagesOfTheTurnAreStoredWithWhatTheyCost() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        record(TWO_CHANGES, null);

        ArgumentCaptor<ChatMessage> captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository, times(3)).save(captor.capture());
        ChatMessage question = captor.getAllValues().get(0);
        ChatMessage reply = captor.getAllValues().get(1);
        assertThat(question.getRole()).isEqualTo(MessageRole.USER);
        assertThat(question.getContent()).isEqualTo("rename the page");
        assertThat(question.getTokensUsed()).isEqualTo(1200);
        assertThat(reply.getRole()).isEqualTo(MessageRole.ASSISTANT);
        assertThat(reply.getTokensUsed()).isEqualTo(300);
        assertThat(reply.isTeaching()).isFalse();
    }

    @Test
    void aTurnAskedForInTeachingModeIsMarkedOnItsReplyAndOnlyThere() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        recorder.record(new TurnRecord(chatSession, "rename the page", parser.parse(TWO_CHANGES).events(), null,
                List.of(), 39, 1200, 300, true));

        ArgumentCaptor<ChatMessage> captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(chatMessageRepository, times(3)).save(captor.capture());
        assertThat(captor.getAllValues().get(0).isTeaching()).isFalse();
        assertThat(captor.getAllValues().get(1).isTeaching()).isTrue();
    }

    @Test
    void aRevisionThatDidNotLandIsNeverRecordedAsWritten_everyChangeIsRemovedAndNamed() {
        publishAnswers(PublishRevisionResponse.Status.FAILED, Map.of());

        TurnOutcome outcome = record(TWO_CHANGES, null);

        assertThat(outcome).isEqualTo(TurnOutcome.NOT_SAVED);
        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).doesNotContain(ChatEventType.FILE_EDIT, ChatEventType.FILE_DELETE);
        assertThat(events.getFirst().getMetadata()).isEqualTo("NOT_SAVED");
        assertThat(events.getLast().getContent()).isEqualTo("Couldn't save these files: src/New.tsx, src/Old.tsx. Please try again.");
    }

    @Test
    void aConflictIsSurfacedTheSameWayAsAFailure() {
        publishAnswers(PublishRevisionResponse.Status.CONFLICT, Map.of());

        assertThat(record(TWO_CHANGES, null)).isEqualTo(TurnOutcome.NOT_SAVED);
    }

    @Test
    void anUnreachableWorkspaceServiceCountsEveryChangedPathAsNotSaved() {
        when(workspaceServiceClient.publishRevision(eq(PROJECT_ID), any())).thenThrow(new RuntimeException("connection refused"));

        TurnOutcome outcome = record("<file path=\"a.tsx\">a</file>", null);

        assertThat(outcome).isEqualTo(TurnOutcome.NOT_SAVED);
        assertThat(savedEvents().getLast().getContent()).isEqualTo("Couldn't save this file: a.tsx. Please try again.");
    }

    @Test
    void aTurnWithNoFileChangesPublishesNothingAndIsRecordedAsAnswered() {
        TurnOutcome outcome = record("<message>Routing lives in App.tsx.</message>", null);

        assertThat(outcome).isEqualTo(TurnOutcome.ANSWERED);
        assertThat(savedEvents().getFirst().getMetadata()).isEqualTo("ANSWERED");
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
        verify(workspaceServiceClient, never()).getMembership(any(), any());
    }

    @Test
    void someoneWhoLostEditAccessWhileItWasGeneratingHasTheirChangesDiscarded() {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenReturn(new ProjectMembershipDto(PROJECT_ID, USER_ID, ProjectRole.VIEWER));

        TurnOutcome outcome = record(TWO_CHANGES, null);

        assertThat(outcome).isEqualTo(TurnOutcome.NOT_SAVED);
        assertThat(savedEvents().getLast().getContent()).isEqualTo(TurnRecorder.ACCESS_CHANGED_NOTICE);
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
    }

    @Test
    void aDeletedProjectDiscardsTheChangesTheSameWay() {
        Request request = Request.create(Request.HttpMethod.GET, "/members", Map.of(), null, StandardCharsets.UTF_8);
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID))
                .thenThrow(new FeignException.NotFound("not found", request, null, Map.of()));

        assertThat(record(TWO_CHANGES, null)).isEqualTo(TurnOutcome.NOT_SAVED);
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
    }

    @Test
    void anUnreachableWorkspaceServiceAtTheAccessCheckIsNotTreatedAsARevoke() {
        when(workspaceServiceClient.getMembership(PROJECT_ID, USER_ID)).thenThrow(new RuntimeException("timeout"));
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        assertThat(record(TWO_CHANGES, null)).isEqualTo(TurnOutcome.SAVED);
    }

    @Test
    void aStoppedTurnIsRecordedWithWhatWasSaidAndItsNoteButNoneOfItsFiles() {
        TurnOutcome outcome = record(TWO_CHANGES, TurnOutcome.STOPPED, BuildTurn.STOPPED_NOTICE);

        assertThat(outcome).isEqualTo(TurnOutcome.STOPPED);
        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).containsExactly(
                ChatEventType.THOUGHT, ChatEventType.MESSAGE, ChatEventType.TODO, ChatEventType.MESSAGE, ChatEventType.MESSAGE);
        assertThat(events.getFirst().getMetadata()).isEqualTo("STOPPED");
        assertThat(events.getLast().getContent()).isEqualTo(BuildTurn.STOPPED_NOTICE);
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
    }

    @Test
    void aFailedTurnSavesNoFilesEither() {
        TurnOutcome outcome = record(TWO_CHANGES, TurnOutcome.FAILED, BuildTurn.FAILED_NOTICE);

        assertThat(outcome).isEqualTo(TurnOutcome.FAILED);
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
    }

    @Test
    void anUnfinishedTurnStillSavesTheFilesItDidWrite() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        TurnOutcome outcome = record(TWO_CHANGES, TurnOutcome.INCOMPLETE, "This answer stopped before it finished.");

        assertThat(outcome).isEqualTo(TurnOutcome.INCOMPLETE);
        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).contains(ChatEventType.FILE_EDIT, ChatEventType.FILE_DELETE);
        assertThat(events.getFirst().getMetadata()).isEqualTo("INCOMPLETE");
        assertThat(events.getLast().getContent()).isEqualTo("This answer stopped before it finished.");
        assertThat(events.getLast().getSequenceOrder()).isEqualTo(events.size() - 1);
    }

    @Test
    void aTurnCutShortByTheDailyAllowanceSavesTheFilesItFinishedAndIsRecordedAsOutOfBudget() {
        publishAnswers(PublishRevisionResponse.Status.APPLIED, Map.of());

        TurnOutcome outcome = record(TWO_CHANGES, TurnOutcome.OUT_OF_BUDGET, "Today's AI allowance ran out part-way through.");

        assertThat(outcome).isEqualTo(TurnOutcome.OUT_OF_BUDGET);
        List<ChatEvent> events = savedEvents();
        assertThat(events).extracting(ChatEvent::getType).contains(ChatEventType.FILE_EDIT, ChatEventType.FILE_DELETE);
        assertThat(events.getFirst().getMetadata()).isEqualTo("OUT_OF_BUDGET");
        assertThat(events.getLast().getContent()).isEqualTo("Today's AI allowance ran out part-way through.");
        verify(workspaceServiceClient, times(1)).publishRevision(any(), any());
    }

    @Test
    void aTurnThatRanOutOfAllowanceBeforeFinishingAnyFileIsStillRecordedAsOutOfBudget() {
        TurnOutcome outcome = record("<message>Starting with the list.</message>", TurnOutcome.OUT_OF_BUDGET,
                "Today's AI allowance ran out before any file was finished, so nothing was changed.");

        assertThat(outcome).isEqualTo(TurnOutcome.OUT_OF_BUDGET);
        verify(workspaceServiceClient, never()).publishRevision(any(), any());
    }

    @Test
    void anUnfinishedTurnWhoseFilesDidNotLandIsNotSavedRatherThanUnfinished() {
        publishAnswers(PublishRevisionResponse.Status.FAILED, Map.of());

        assertThat(record(TWO_CHANGES, TurnOutcome.INCOMPLETE, "This answer stopped before it finished."))
                .isEqualTo(TurnOutcome.NOT_SAVED);
    }

    @Test
    void whenTheBatchSaveIsRejectedEachEventIsSavedOnItsOwnSoTheConversationSurvives() {
        doThrow(new RuntimeException("batch rejected")).when(chatEventRepository).saveAll(anyList());

        record("<message>One.</message><message>Two.</message>", null);

        verify(chatEventRepository, times(3)).save(any(ChatEvent.class));
    }
}
