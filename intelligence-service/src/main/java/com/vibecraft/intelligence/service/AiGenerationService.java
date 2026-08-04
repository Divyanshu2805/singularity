package com.vibecraft.intelligence.service;

import com.vibecraft.intelligence.dto.chat.ActiveGenerationResponse;
import com.vibecraft.intelligence.dto.chat.StreamResponse;
import reactor.core.publisher.Flux;

import java.util.Optional;

/**
 * The build pipeline: turning a user's message into generated files and a saved chat turn.
 *
 * <p>Handles: starting a generation and streaming it, asking whether one is already running for the caller in a
 * project, reattaching to one, stopping one, and stopping every generation workspace-service reports a project or a
 * member no longer has standing to run - a deleted project or a removed member.
 *
 * <p>A generation belongs to the server, not to the connection that asked for it, so closing the response only stops
 * watching.
 */
public interface AiGenerationService {

    Flux<StreamResponse> streamResponse(String message, Long projectId, boolean teachingMode);

    Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId);

    Optional<Flux<StreamResponse>> watchActiveGeneration(Long projectId);

    boolean stopActiveGeneration(Long projectId);

    /**
     * Stops the in-flight generation(s) a revoked project or membership can no longer authorize. A null
     * {@code userId} stops every generation running against the project (the project itself was deleted); a
     * non-null one stops only that user's (they were removed, the rest of the project is unaffected). Called only
     * from the internal API - there is no end-user route to this, since the caller is workspace-service reacting to
     * its own delete/remove, not a browser request.
     */
    void stopGenerationsForProject(Long projectId, Long userId);
}
