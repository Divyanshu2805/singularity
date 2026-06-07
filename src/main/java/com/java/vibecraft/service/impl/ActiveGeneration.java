package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.StreamResponse;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * One AI response being generated, owned by the server rather than by whichever browser asked for it.
 *
 * <p>It used to be the other way round: the model call was the HTTP response's own stream, so a refresh closed the
 * connection, Spring cancelled the stream, the model call went with it, and {@code finalizeChats} - which only runs
 * on completion - never saved the message, the reply or the files. Now the generation runs to the end regardless,
 * and a connection is just a viewer: {@link #watch()} replays everything written so far and then follows it live,
 * so a refreshed page (or a second tab) picks up exactly where the response is.
 *
 * <p>Every mutation and every new viewer goes through this object's monitor, which is what guarantees a viewer sees
 * each chunk exactly once - replayed if it arrived before they attached, live if after, never both or neither.
 */
public final class ActiveGeneration {

    public enum Status {
        /** The model is still writing. */
        RUNNING,
        /** The model finished; the reply and files are being saved. History will have it shortly. */
        SAVING
    }

    private final Long projectId;
    private final Long userId;
    private final String userMessage;
    private final boolean teachingMode;
    private final Instant startedAt = Instant.now();

    private final StringBuilder text = new StringBuilder();
    private final List<FluxSink<StreamResponse>> viewers = new CopyOnWriteArrayList<>();
    private Status status = Status.RUNNING;
    private boolean streamEnded;
    private Throwable failure;
    private volatile Disposable subscription;

    ActiveGeneration(Long projectId, Long userId, String userMessage, boolean teachingMode) {
        this.projectId = projectId;
        this.userId = userId;
        this.userMessage = userMessage;
        this.teachingMode = teachingMode;
    }

    synchronized void append(String chunk) {
        if (streamEnded || chunk == null || chunk.isEmpty()) return;
        text.append(chunk);
        StreamResponse response = new StreamResponse(chunk);
        viewers.forEach(viewer -> viewer.next(response));
    }

    /** The model is done. Viewers' streams end here; saving carries on without them. */
    synchronized void markStreamComplete() {
        if (streamEnded) return;
        streamEnded = true;
        status = Status.SAVING;
        viewers.forEach(FluxSink::complete);
        viewers.clear();
    }

    synchronized void markFailed(Throwable error) {
        if (streamEnded) return;
        streamEnded = true;
        failure = error;
        viewers.forEach(viewer -> viewer.error(error));
        viewers.clear();
    }

    /**
     * Everything generated so far as one chunk, then each new chunk as it arrives, then completion (or the failure).
     * Cancelling the returned stream - a closed tab - only detaches this viewer; the generation doesn't notice.
     */
    Flux<StreamResponse> watch() {
        return Flux.create(sink -> {
            synchronized (this) {
                if (!text.isEmpty()) sink.next(new StreamResponse(text.toString()));
                if (streamEnded) {
                    if (failure != null) sink.error(failure);
                    else sink.complete();
                    return;
                }
                viewers.add(sink);
            }
            sink.onDispose(() -> viewers.remove(sink));
        }, FluxSink.OverflowStrategy.BUFFER);
    }

    void setSubscription(Disposable subscription) {
        this.subscription = subscription;
    }

    /** Stops the model call itself. Nothing is saved - the same as a stopped answer always was. */
    void stop(Throwable reason) {
        Disposable current = subscription;
        if (current != null) current.dispose();
        markFailed(reason);
    }

    public Long projectId() {
        return projectId;
    }

    public Long userId() {
        return userId;
    }

    public String userMessage() {
        return userMessage;
    }

    public boolean teachingMode() {
        return teachingMode;
    }

    public Instant startedAt() {
        return startedAt;
    }

    public synchronized Status status() {
        return status;
    }
}
