package com.java.vibecraft.controller;

import com.java.vibecraft.dto.chat.ChatRequest;
import com.java.vibecraft.dto.chat.ChatResponse;
import com.java.vibecraft.dto.chat.StreamResponse;
import com.java.vibecraft.service.AiGenerationService;
import com.java.vibecraft.service.ChatService;
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

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StreamResponse>> streamChat(
            @RequestBody @Valid ChatRequest request) {

        return aiGenerationService.streamResponse(request.message(), request.projectId())
                .map(data -> ServerSentEvent.<StreamResponse>builder()
                        .data(data)
                        .build())
                .onErrorResume(error -> {
                    log.error("Streaming failed for projectId: {}", request.projectId(), error);
                    String message = isRateLimited(error)
                            ? "The AI provider is currently rate-limited. Please try again in a moment."
                            : "Something went wrong while generating a response. Please try again.";
                    return Flux.just(ServerSentEvent.<StreamResponse>builder()
                            .event("error")
                            .data(new StreamResponse(message))
                            .build());
                });
    }

    @GetMapping("/projects/{projectId}")
    public ResponseEntity<List<ChatResponse>> getChatHistory(
            @PathVariable Long projectId) {

        return ResponseEntity.ok(chatService.getProjectChatHistory(projectId));
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
