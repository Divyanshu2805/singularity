package com.singularity.intelligence.controller;

import com.singularity.intelligence.dto.code.AskCodeRequest;
import com.singularity.intelligence.dto.code.CodeInsightResponse;
import com.singularity.intelligence.dto.code.CodeNoteResponse;
import com.singularity.intelligence.dto.code.ExplainCodeRequest;
import com.singularity.intelligence.dto.code.GlossaryEntryResponse;
import com.singularity.intelligence.dto.code.GlossaryRequest;
import com.singularity.intelligence.dto.code.LessonRequest;
import com.singularity.intelligence.dto.code.OverviewRequest;
import com.singularity.intelligence.dto.code.SaveCodeNoteRequest;
import com.singularity.intelligence.dto.code.TaskCheckRequest;
import com.singularity.intelligence.dto.code.TaskRequest;
import com.singularity.intelligence.dto.code.TourRequest;
import com.singularity.intelligence.dto.code.TourResponse;
import com.singularity.intelligence.service.CodeInsightService;
import com.singularity.intelligence.util.SseHeartbeat;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * The code lens: explain a selection, then ask follow-up questions about it, and keep the thread.
 *
 * <p>Handles: the explain and ask answers both whole and streamed, teaching mode's two streams - the big picture of a
 * saved turn and the lesson on what one of its steps changed - the learning that belongs to the person and the
 * project (the tour of the whole project, the glossary of terms, and a step's "try changing this" task with the check
 * of it, each streamed and kept, and the tour and glossary read back), and the caller's saved notes: listing them,
 * saving one finished exchange, deleting one and clearing them all.
 *
 * <p>The answering endpoints are read-only and can produce text and nothing else. The notes are the thread itself:
 * one per project per user, kept until its author clears it. A failure mid-stream arrives as a named error event, the
 * same shape the build chat uses. Both streams carry an {@link SseHeartbeat} for the same reason the build chat's
 * does - a quiet model shouldn't outlast Cloudflare's idle-connection timeout in production.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api/projects/{projectId}/code")
public class CodeInsightController {

    private final CodeInsightService codeInsightService;

    @PostMapping("/explain")
    public ResponseEntity<CodeInsightResponse> explain(
            @PathVariable Long projectId,
            @RequestBody @Valid ExplainCodeRequest request) {
        return ResponseEntity.ok(codeInsightService.explain(projectId, request));
    }

    @PostMapping(value = "/explain/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamExplain(
            @PathVariable Long projectId,
            @RequestBody @Valid ExplainCodeRequest request) {
        return asEvents(codeInsightService.streamExplain(projectId, request), projectId);
    }

    @PostMapping(value = "/ask/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamAsk(
            @PathVariable Long projectId,
            @RequestBody @Valid AskCodeRequest request) {
        return asEvents(codeInsightService.streamAsk(projectId, request), projectId);
    }

    @PostMapping(value = "/lesson/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamLesson(
            @PathVariable Long projectId,
            @RequestBody @Valid LessonRequest request) {
        return asEvents(codeInsightService.streamLesson(projectId, request), projectId);
    }

    @PostMapping(value = "/overview/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamOverview(
            @PathVariable Long projectId,
            @RequestBody @Valid OverviewRequest request) {
        return asEvents(codeInsightService.streamOverview(projectId, request), projectId);
    }

    @GetMapping("/tour")
    public ResponseEntity<TourResponse> getTour(@PathVariable Long projectId) {
        TourResponse tour = codeInsightService.getTour(projectId);
        return tour == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(tour);
    }

    @PostMapping(value = "/tour/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamTour(
            @PathVariable Long projectId,
            @RequestBody @Valid TourRequest request) {
        return asEvents(codeInsightService.streamTour(projectId, request), projectId);
    }

    @GetMapping("/glossary")
    public ResponseEntity<List<GlossaryEntryResponse>> getGlossary(@PathVariable Long projectId) {
        return ResponseEntity.ok(codeInsightService.getGlossary(projectId));
    }

    @PostMapping(value = "/glossary/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamTerm(
            @PathVariable Long projectId,
            @RequestBody @Valid GlossaryRequest request) {
        return asEvents(codeInsightService.streamTerm(projectId, request), projectId);
    }

    @DeleteMapping("/glossary/{entryId}")
    public ResponseEntity<Void> deleteTerm(@PathVariable Long projectId, @PathVariable Long entryId) {
        codeInsightService.deleteTerm(projectId, entryId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/task/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamTask(
            @PathVariable Long projectId,
            @RequestBody @Valid TaskRequest request) {
        return asEvents(codeInsightService.streamTask(projectId, request), projectId);
    }

    @PostMapping(value = "/task-check/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamTaskCheck(
            @PathVariable Long projectId,
            @RequestBody @Valid TaskCheckRequest request) {
        return asEvents(codeInsightService.streamTaskCheck(projectId, request), projectId);
    }

    private Flux<ServerSentEvent<String>> asEvents(Flux<String> answer, Long projectId) {
        Flux<ServerSentEvent<String>> events = answer
                .map(text -> ServerSentEvent.builder(text).build())
                .onErrorResume(error -> {
                    log.error("Streaming code insight failed for projectId: {}", projectId, error);
                    return Flux.just(ServerSentEvent.builder("Couldn't get an answer from the AI right now. "
                            + "Please try again.").event("error").build());
                });
        return SseHeartbeat.withHeartbeat(events);
    }

    @PostMapping("/ask")
    public ResponseEntity<CodeInsightResponse> ask(
            @PathVariable Long projectId,
            @RequestBody @Valid AskCodeRequest request) {
        return ResponseEntity.ok(codeInsightService.ask(projectId, request));
    }

    @GetMapping("/notes")
    public ResponseEntity<List<CodeNoteResponse>> getNotes(@PathVariable Long projectId) {
        return ResponseEntity.ok(codeInsightService.getNotes(projectId));
    }

    @PostMapping("/notes")
    public ResponseEntity<CodeNoteResponse> saveNote(
            @PathVariable Long projectId,
            @RequestBody @Valid SaveCodeNoteRequest request) {
        return ResponseEntity.ok(codeInsightService.saveNote(projectId, request));
    }

    @DeleteMapping("/notes/{noteId}")
    public ResponseEntity<Void> deleteNote(@PathVariable Long projectId, @PathVariable Long noteId) {
        codeInsightService.deleteNote(projectId, noteId);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/notes")
    public ResponseEntity<Void> clearNotes(@PathVariable Long projectId) {
        codeInsightService.clearNotes(projectId);
        return ResponseEntity.noContent().build();
    }
}
