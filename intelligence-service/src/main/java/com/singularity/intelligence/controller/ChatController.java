package com.singularity.intelligence.controller;

import com.singularity.intelligence.dto.chat.ActiveGenerationResponse;
import com.singularity.intelligence.dto.chat.ChatRequest;
import com.singularity.intelligence.dto.chat.ChatResponse;
import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.chat.LastTurnChangesResponse;
import com.singularity.intelligence.dto.chat.StreamResponse;
import com.singularity.intelligence.service.AiGenerationService;
import com.singularity.intelligence.dto.chat.SuggestionsResponse;
import com.singularity.intelligence.service.ChatService;
import com.singularity.intelligence.service.SuggestionService;
import com.singularity.intelligence.util.SseHeartbeat;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * The project build chat, for the browser.
 *
 * <p>Handles: starting a generation and streaming it, reading the saved history, clearing it, the last turn's changed files for
 * the editor's diffs, asking whether a generation is already running, reattaching to one, and stopping one.
 *
 * <p>Closing the response does not stop a generation - it only stops watching it; stopping is its own endpoint. A
 * stream carries four kinds of event. A piece of the answer's text is an unnamed event, as it always was. {@code
 * status} is a line saying what the server is doing between pieces, {@code replace} is the whole text again after the
 * server cut something out of it, and {@code done} closes the stream with how the turn ended - sent only after the
 * turn is saved, so a client that reloads the conversation on it finds the turn there. Every one carries the same
 * {@code { "text": ... }} body.
 *
 * <p>A turn that fails or is stopped still ends in {@code done}: the failure is part of the saved turn. An event named
 * {@code error} is left for the case where the turn could not be saved at all. Both streams carry an
 * {@link SseHeartbeat} so a long silent stretch - the model thinking, the files saving - doesn't outlast Cloudflare's
 * idle-connection timeout in production.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/chat")
@Slf4j
public class ChatController {

    private static final String SAVE_FAILED =
            "This response couldn't be saved, so nothing was changed. Please try again.";

    private final AiGenerationService aiGenerationService;
    private final ChatService chatService;
    private final SuggestionService suggestionService;

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StreamResponse>> streamChat(
            @RequestBody @Valid ChatRequest request) {

        return toEvents(aiGenerationService.streamResponse(request.message(), request.projectId(),
                        Boolean.TRUE.equals(request.teaching())),
                request.projectId());
    }

    @GetMapping("/projects/{projectId}")
    public ResponseEntity<List<ChatResponse>> getChatHistory(
            @PathVariable Long projectId) {

        return ResponseEntity.ok(chatService.getProjectChatHistory(projectId));
    }

    @DeleteMapping("/projects/{projectId}")
    public ResponseEntity<Void> clearChat(@PathVariable Long projectId) {
        chatService.clearChat(projectId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/projects/{projectId}/last-turn-changes")
    public ResponseEntity<LastTurnChangesResponse> getLastTurnChanges(@PathVariable Long projectId) {
        return ResponseEntity.ok(chatService.getLastTurnChanges(projectId));
    }

    @GetMapping("/projects/{projectId}/active")
    public ResponseEntity<ActiveGenerationResponse> getActiveGeneration(@PathVariable Long projectId) {
        return aiGenerationService.findActiveGeneration(projectId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @GetMapping(value = "/projects/{projectId}/active/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<Flux<ServerSentEvent<StreamResponse>>> watchActiveGeneration(@PathVariable Long projectId) {
        return aiGenerationService.watchActiveGeneration(projectId)
                .map(stream -> ResponseEntity.ok().contentType(MediaType.TEXT_EVENT_STREAM).body(toEvents(stream, projectId)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/projects/{projectId}/active/stop")
    public ResponseEntity<Void> stopActiveGeneration(@PathVariable Long projectId) {
        aiGenerationService.stopActiveGeneration(projectId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/projects/{projectId}/suggestions")
    public ResponseEntity<SuggestionsResponse> suggestNextSteps(@PathVariable Long projectId) {
        return ResponseEntity.ok(new SuggestionsResponse(suggestionService.nextSteps(projectId)));
    }

    private Flux<ServerSentEvent<StreamResponse>> toEvents(Flux<GenerationSignal> stream, Long projectId) {
        Flux<ServerSentEvent<StreamResponse>> events = stream
                .map(ChatController::toEvent)
                .onErrorResume(error -> {
                    log.error("The build stream for projectId: {} ended without a saved turn", projectId, error);
                    return Flux.just(ServerSentEvent.<StreamResponse>builder()
                            .event("error")
                            .data(new StreamResponse(SAVE_FAILED))
                            .build());
                });
        return SseHeartbeat.withHeartbeat(events);
    }

    static ServerSentEvent<StreamResponse> toEvent(GenerationSignal signal) {
        ServerSentEvent.Builder<StreamResponse> event = ServerSentEvent.<StreamResponse>builder()
                .data(new StreamResponse(signal.text() == null ? "" : signal.text()));
        return switch (signal.kind()) {
            case TEXT -> event.build();
            case STATUS -> event.event("status").build();
            case REPLACE -> event.event("replace").build();
            case DONE -> event.event("done").build();
        };
    }
}
