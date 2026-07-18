package com.vibecraft.intelligence.controller;

import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.ChatRequest;
import com.vibecraft.intelligence.dto.chat.ChatResponse;
import com.vibecraft.intelligence.dto.chat.LastTurnChangesResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import com.vibecraft.intelligence.service.AiGenerationService;
import com.vibecraft.intelligence.service.ChatService;
import com.vibecraft.intelligence.service.impl.GenerationStoppedException;
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

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/chat")
@Slf4j
public class ChatController {

    private final AiGenerationService aiGenerationService;
    private final ChatService chatService;

    /**
     * Starts a response and streams it. Closing this connection no longer stops the response - it only stops
     * watching it. {@code POST .../active/stop} is what stops it.
     */
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

    /** The latest turn's changed files with their previous versions, so the editor can show that turn's diffs. */
    @GetMapping("/projects/{projectId}/last-turn-changes")
    public ResponseEntity<LastTurnChangesResponse> getLastTurnChanges(@PathVariable Long projectId) {
        return ResponseEntity.ok(chatService.getLastTurnChanges(projectId));
    }

    /** The caller's response still being generated in this project - 204 if there isn't one. */
    @GetMapping("/projects/{projectId}/active")
    public ResponseEntity<ActiveGenerationResponse> getActiveGeneration(@PathVariable Long projectId) {
        return aiGenerationService.findActiveGeneration(projectId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** Reattaches to that response: what's been written so far, then the rest live. 204 if it has already finished. */
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
        return stream
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
