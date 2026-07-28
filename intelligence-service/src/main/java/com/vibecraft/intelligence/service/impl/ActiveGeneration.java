package com.vibecraft.intelligence.service.impl;

import com.vibecraft.intelligence.dto.chat.StreamResponse;
import reactor.core.Disposable;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * One AI response being generated, owned by the server rather than by whichever browser asked for it.
 *
 * <p>Handles: accumulating the model's output, fanning each chunk out to every attached viewer, replaying everything
 * written so far to a viewer that attaches late, ending every viewer's stream on completion or failure, and stopping
 * the underlying model call.
 *
 * <p>It used to be the other way round: the model call was the HTTP response's own stream, so a refresh closed the
 * connection, the stream was cancelled, the model call went with it, and the turn - which is only saved on completion
 * - was never stored at all. Now the generation runs to the end regardless and a connection is just a viewer, so a
 * refreshed page or a second tab picks up exactly where the response is.
 *
 * <p>Every mutation and every new viewer goes through this object's monitor, which is what guarantees a viewer sees
 * each chunk exactly once - replayed if it arrived before they attached, live if after, never both or neither.
 */
public final class ActiveGeneration {

    public enum Status {
        RUNNING,
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
