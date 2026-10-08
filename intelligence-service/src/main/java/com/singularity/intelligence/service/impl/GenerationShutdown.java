package com.singularity.intelligence.service.impl;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.SmartLifecycle;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;

/**
 * Ends the build turns still in progress when the service is asked to shut down, so each one is recorded first.
 *
 * <p>Handles: abandoning every running turn at the start of shutdown, and waiting a bounded moment for each to be
 * saved - with a note that the server restarted, and none of its files - before the rest of the service goes away.
 *
 * <p>A turn lives in memory and is saved only when it ends. Every deploy restarts this service, and a turn running at
 * that moment used to vanish: the model call was cut with the process, nothing was recorded, and the person's question
 * was gone from the conversation after a refresh. Recording it here leaves the question and a Retry behind instead.
 *
 * <p>It runs in the last lifecycle phase, which is the first to stop. That puts it ahead of the web server, so the
 * turn's viewers are still connected to be told how it ended and their streams close on their own - otherwise each
 * open stream would hold the graceful shutdown for its full timeout - and ahead of the database connections the save
 * needs. A turn already saving is left to finish; only the wait applies to it.
 *
 * <p>A process that is killed outright never gets here. The browser covers that case by keeping the question itself.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class GenerationShutdown implements SmartLifecycle {

    static final Duration WAIT = Duration.ofSeconds(10);

    private final GenerationRegistry generationRegistry;
    private volatile boolean running;

    @Override
    public void start() {
        running = true;
    }

    @Override
    public void stop() {
        running = false;
        List<ActiveGeneration> turns = generationRegistry.all();
        if (turns.isEmpty()) {
            return;
        }
        log.warn("Shutting down with {} build turn(s) in progress - ending them so each is recorded", turns.size());
        turns.forEach(ActiveGeneration::abandon);

        long deadline = System.nanoTime() + WAIT.toNanos();
        int recorded = 0;
        for (ActiveGeneration turn : turns) {
            Duration left = Duration.ofNanos(Math.max(0, deadline - System.nanoTime()));
            if (turn.awaitFinished(left)) {
                recorded++;
            }
        }
        if (recorded < turns.size()) {
            log.error("{} of {} build turn(s) could not be recorded before shutdown", turns.size() - recorded, turns.size());
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public int getPhase() {
        return Integer.MAX_VALUE;
    }
}
