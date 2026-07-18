package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import reactor.core.publisher.Flux;

import java.util.Optional;

public interface AiGenerationService {

    /**
     * Starts a generation that runs to completion on the server whatever happens to the caller's connection, and
     * returns a live view of it.
     */
    Flux<StreamResponse> streamResponse(String message, Long projectId, boolean teachingMode);

    /** The caller's generation still running (or saving) in this project, if any. */
    Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId);

    /** Reattaches to that generation: everything so far, then the rest as it's written. Empty if none. */
    Optional<Flux<StreamResponse>> watchActiveGeneration(Long projectId);

    /** Stops the caller's running generation. Nothing of it is saved. False if there was none. */
    boolean stopActiveGeneration(Long projectId);
}
