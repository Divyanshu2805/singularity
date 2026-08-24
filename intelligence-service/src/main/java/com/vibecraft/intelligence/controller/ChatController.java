package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.ChatRequest;
import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.dto.chat.LastTurnChangesResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import com.vibecraft.intelligence.service.AiGenerationService;
import com.vibecraft.intelligence.service.ChatService;
import com.vibecraft.intelligence.service.impl.GenerationStoppedException;
import com.vibecraft.intelligence.util.SseHeartbeat;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;

import java.util.List;

/**
 * The project build chat, for the browser.
 *
 * <p>Handles: starting a generation and streaming it, reading the saved history, the last turn's changed files for
 * the editor's diffs, asking whether a generation is already running, reattaching to one, and stopping one.
 *
 * <p>Closing the response no longer stops a generation - it only stops watching it; stopping is its own endpoint. A
 * failure mid-stream cannot become an HTTP status, because the response has already started, so it arrives as a named
 * error event the client renders in place, with rate limiting and a user-requested stop distinguished from a genuine
 * failure. Both streams carry an {@link SseHeartbeat} so a long silent stretch of "the model is thinking" doesn't
 * outlast Cloudflare's idle-connection timeout in production.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/chat")
@Slf4j
public class ChatController {

    private final AiGenerationService aiGenerationService;
    private final ChatService chatService;

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StreamResponse>> streamChat(
            @RequestBody @Valid ChatRequest request) {

        return toEvents(aiGenerationService.streamResponse(request.message(), request.projectId(), Boolean.TRUE.equals(request.teachingMode())),
                request.projectId());
    }

    @GetMapping("/projects/{projectId}")
    public ResponseEntity<List<ChatResponse>> getChatHistory(
            @PathVariable Long projectId) {

        return ResponseEntity.ok(chatService.getProjectChatHistory(projectId));
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

    private Flux<ServerSentEvent<StreamResponse>> toEvents(Flux<StreamResponse> stream, Long projectId) {
        Flux<ServerSentEvent<StreamResponse>> events = stream
                .map(data -> ServerSentEvent.<StreamResponse>builder()
                        .data(data)
                        .build())
                .onErrorResume(error -> {
                    String message;
                    if (error instanceof GenerationStoppedException) {
                        message = error.getMessage();
                    } else {
                        log.error("Streaming failed for projectId: {}", projectId, error);
                        message = isRateLimited(error)
                                ? "The AI provider is currently rate-limited. Please try again in a moment."
                                : "Something went wrong while generating a response. Please try again.";
                    }
                    return Flux.just(ServerSentEvent.<StreamResponse>builder()
                            .event("error")
                            .data(new StreamResponse(message))
                            .build());
                });
        return SseHeartbeat.withHeartbeat(events);
    }

    private boolean isRateLimited(Throwable error) {
        for (Throwable cause = error; cause != null; cause = cause.getCause()) {
            if (cause instanceof WebClientResponseException.TooManyRequests) {
                return true;
            }
        }
        return false;
    }
}
