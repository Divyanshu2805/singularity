package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.usage.UsageReservation;
import com.singularity.intelligence.llm.GeneratedPath;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * One build turn in progress, owned by the server rather than by whichever browser asked for it.
 *
 * <p>Handles: holding the turn's text as it stands, fanning each new piece, status line and correction out to every
 * attached viewer, replaying where things are to a viewer that attaches late, moving the turn from running to saving
 * to finished, taking a request to stop, and letting a caller wait until the turn has really ended.
 *
 * <p>A viewer's stream now stays open until the turn has been saved and ends with the outcome. It used to end the
 * moment the model stopped writing, while the server went on to parse, possibly re-ask the model, and save - none of
 * which a viewer could see. So the browser kept showing its own reading of the text, could not tell a turn that saved
 * from one that did not, and raced the still-running save with a retry of its own.
 *
 * <p>Stopping is only possible while the turn is running. Once it has begun saving it is past the point where
 * stopping means anything - its files publish as one revision or not at all - so a late stop is refused and the turn
 * finishes. The stop itself does not save anything: it cancels the model call and leaves the thread running the turn
 * to record what happened, which keeps one writer for the turn's record.
 *
 * <p>A turn can also be abandoned, which is the same stop asked for by the server itself as it shuts down. It is kept
 * apart from a person's stop only so the record can say which it was: "you stopped this" would be untrue of a turn
 * that a deploy cut short.
 *
 * <p>Every mutation and every new viewer goes through this object's monitor, which is what guarantees a viewer sees
 * each piece exactly once - replayed if it arrived before they attached, live if after, never both or neither.
 *
 * <p>It also carries the usage reservation claimed before the turn started, handed back exactly once, so a stop and
 * the turn's own completion can never both settle it.
 */
public final class ActiveGeneration {

    public enum Status {
        RUNNING,
        SAVING,
        FINISHED
    }

    private final Long projectId;
    private final Long userId;
    private final String userMessage;
    private final Instant startedAt;

    private final StringBuilder text = new StringBuilder();
    private final List<FluxSink<GenerationSignal>> viewers = new CopyOnWriteArrayList<>();
    private final CountDownLatch finished = new CountDownLatch(1);
    private Status status = Status.RUNNING;
    private String statusLine;
    private String outcome;
    private Throwable failure;
    private boolean stopRequested;
    private boolean abandoned;
    private Runnable cancelCurrentCall;
    private UsageReservation reservation;

    ActiveGeneration(Long projectId, Long userId, String userMessage, Instant startedAt) {
        this.projectId = projectId;
        this.userId = userId;
        this.userMessage = userMessage;
        this.startedAt = startedAt;
    }

    synchronized void append(String chunk) {
        if (status != Status.RUNNING || stopRequested || chunk == null || chunk.isEmpty()) return;
        text.append(chunk);
        emit(GenerationSignal.text(chunk));
    }

    synchronized void replaceText(String wholeText) {
        if (status != Status.RUNNING) return;
        text.setLength(0);
        text.append(wholeText);
        emit(GenerationSignal.replace(wholeText));
    }

    synchronized void announce(String line) {
        if (status == Status.FINISHED) return;
        statusLine = line;
        emit(GenerationSignal.status(line));
    }

    synchronized void filesRead(List<String> paths) {
        List<String> shown = paths.stream()
                .map(GeneratedPath::normalize)
                .flatMap(Optional::stream)
                .filter(path -> path.chars().noneMatch(character -> "\",<>".indexOf(character) >= 0))
                .distinct()
                .toList();
        if (shown.isEmpty()) return;
        String label = "Reading " + shown.size() + (shown.size() == 1 ? " file" : " files");
        append("<tool args=\"" + String.join(",", shown) + "\">" + label + "</tool>");
        announce(label);
    }

    synchronized boolean beginSaving() {
        if (status != Status.RUNNING || stopRequested) return false;
        status = Status.SAVING;
        return true;
    }

    synchronized void finish(String turnOutcome) {
        if (status == Status.FINISHED) return;
        status = Status.FINISHED;
        outcome = turnOutcome;
        viewers.forEach(viewer -> {
            viewer.next(GenerationSignal.done(turnOutcome));
            viewer.complete();
        });
        viewers.clear();
        finished.countDown();
    }

    synchronized void fail(Throwable error) {
        if (status == Status.FINISHED) return;
        status = Status.FINISHED;
        failure = error;
        viewers.forEach(viewer -> viewer.error(error));
        viewers.clear();
        finished.countDown();
    }

    boolean requestStop() {
        return stop(false);
    }

    boolean abandon() {
        return stop(true);
    }

    private boolean stop(boolean byTheServer) {
        Runnable cancel;
        synchronized (this) {
            if (status != Status.RUNNING || stopRequested) return false;
            stopRequested = true;
            abandoned = byTheServer;
            cancel = cancelCurrentCall;
        }
        if (cancel != null) cancel.run();
        return true;
    }

    synchronized boolean abandoned() {
        return abandoned;
    }

    void onCancel(Runnable cancel) {
        boolean alreadyStopped;
        synchronized (this) {
            cancelCurrentCall = cancel;
            alreadyStopped = stopRequested;
        }
        if (alreadyStopped && cancel != null) cancel.run();
    }

    synchronized boolean stopRequested() {
        return stopRequested;
    }

    boolean awaitFinished(Duration timeout) {
        try {
            return finished.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    Flux<GenerationSignal> watch() {
        return Flux.create(sink -> {
            synchronized (this) {
                if (!text.isEmpty()) sink.next(GenerationSignal.text(text.toString()));
                if (status == Status.FINISHED) {
                    if (failure != null) {
                        sink.error(failure);
                    } else {
                        sink.next(GenerationSignal.done(outcome));
                        sink.complete();
                    }
                    return;
                }
                if (statusLine != null) sink.next(GenerationSignal.status(statusLine));
                viewers.add(sink);
            }
            sink.onDispose(() -> viewers.remove(sink));
        }, FluxSink.OverflowStrategy.BUFFER);
    }

    private void emit(GenerationSignal signal) {
        viewers.forEach(viewer -> viewer.next(signal));
    }

    synchronized void setReservation(UsageReservation reservation) {
        this.reservation = reservation;
    }

    synchronized UsageReservation reservation() {
        return reservation;
    }

    synchronized UsageReservation takeReservation() {
        UsageReservation taken = reservation;
        reservation = null;
        return taken;
    }

    synchronized String text() {
        return text.toString();
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

    public Instant startedAt() {
        return startedAt;
    }

    public synchronized Status status() {
        return status;
    }
}
