package com.singularity.intelligence.service;

import com.singularity.intelligence.dto.chat.ActiveGenerationResponse;
import com.singularity.intelligence.dto.chat.GenerationSignal;
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
 * watching. What a watcher receives is a sequence of signals - the answer's text as it is written, what the server is
 * doing in between, and finally how the turn ended, sent only once the turn has been saved.
 *
 * <p>Teaching mode changes nothing about how a turn is built. The flag is only carried to the saved reply, where it
 * decides whether the turn's steps can be opened for a lesson afterwards.
 */
public interface AiGenerationService {

    Flux<GenerationSignal> streamResponse(String message, Long projectId, boolean teaching);

    Optional<ActiveGenerationResponse> findActiveGeneration(Long projectId);

    Optional<Flux<GenerationSignal>> watchActiveGeneration(Long projectId);

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
