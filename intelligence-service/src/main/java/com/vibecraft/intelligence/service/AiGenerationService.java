package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import reactor.core.publisher.Flux;

import java.util.Optional;

/**
 * The build pipeline: turning a user's message into generated files and a saved chat turn.
 *
 * <p>Handles: starting a generation and streaming it, asking whether one is already running for the caller in a
 * project, reattaching to one, and stopping one.
 *
 * <p>A generation belongs to the server, not to the connection that asked for it, so closing the response only stops
 * watching.
 */
public interface AiGenerationService {

    Flux<StreamResponse> streamResponse(String message, Long projectId, boolean teachingMode);

    Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId);

    Optional<Flux<StreamResponse>> watchActiveGeneration(Long projectId);

    boolean stopActiveGeneration(Long projectId);
}
