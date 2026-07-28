package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.dto.code.AskCodeRequest;
import com.vibecraft.intelligence.dto.code.CodeInsightResponse;
import com.vibecraft.intelligence.dto.code.CodeNoteResponse;
import com.vibecraft.intelligence.dto.code.ExplainCodeRequest;
import com.vibecraft.intelligence.dto.code.SaveCodeNoteRequest;
import com.vibecraft.intelligence.service.CodeInsightService;
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
 * <p>Handles: the explain and ask answers both whole and streamed, and the caller's saved notes - listing them,
 * saving one finished exchange, deleting one and clearing them all.
 *
 * <p>The answering endpoints are read-only and can produce text and nothing else. The notes are the thread itself:
 * one per project per user, kept until its author clears it. A failure mid-stream arrives as a named error event, the
 * same shape the build chat uses.
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

    private Flux<ServerSentEvent<String>> asEvents(Flux<String> answer, Long projectId) {
        return answer
                .map(text -> ServerSentEvent.builder(text).build())
                .onErrorResume(error -> {
                    log.error("Streaming code insight failed for projectId: {}", projectId, error);
                    return Flux.just(ServerSentEvent.builder("Couldn't get an answer from the AI right now. "
                            + "Please try again.").event("error").build());
                });
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
