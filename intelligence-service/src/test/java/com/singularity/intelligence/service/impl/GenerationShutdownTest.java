package com.singularity.intelligence.service.impl;

import org.junit.jupiter.api.Test;
import org.springframework.context.SmartLifecycle;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what happens to build turns still running when the service is told to shut down.
 *
 * <p>Every deploy restarts the service, and a turn in progress at that moment used to disappear without a record. Each
 * one must be abandoned - not stopped as if its owner had asked - and waited for, so it is saved before the database
 * connections go; a turn already saving must be left to finish; and a shutdown with nothing running must not wait.
 */
class GenerationShutdownTest {

    private final GenerationRegistry registry = new GenerationRegistry(Clock.systemUTC());
    private final GenerationShutdown shutdown = new GenerationShutdown(registry);

    @Test
    void everyTurnInProgressIsAbandonedAndWaitedForBeforeShutdownCarriesOn() throws Exception {
        ActiveGeneration first = registry.start(1L, 10L, "build a todo app");
        ActiveGeneration second = registry.start(2L, 11L, "add a dark mode");
        CountDownLatch bothRecorded = new CountDownLatch(2);
        for (ActiveGeneration turn : new ActiveGeneration[]{first, second}) {
            turn.onCancel(() -> Thread.ofVirtual().start(() -> {
                registry.remove(turn);
                turn.finish("FAILED");
                bothRecorded.countDown();
            }));
        }

        shutdown.stop();

        assertThat(bothRecorded.await(1, TimeUnit.SECONDS)).isTrue();
        assertThat(first.abandoned()).isTrue();
        assertThat(second.abandoned()).isTrue();
        assertThat(first.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
        assertThat(second.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void aTurnAlreadySavingIsLeftToFinishRatherThanAbandoned() throws Exception {
        ActiveGeneration saving = registry.start(1L, 10L, "build a todo app");
        assertThat(saving.beginSaving()).isTrue();
        Thread.ofVirtual().start(() -> {
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            saving.finish("SAVED");
        });

        shutdown.stop();

        assertThat(saving.abandoned()).isFalse();
        assertThat(saving.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void aShutdownWithNothingRunningDoesNotWait() {
        long started = System.nanoTime();

        shutdown.stop();

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
    }

    @Test
    void itStopsBeforeEverythingElseAndReportsWhetherItIsRunning() {
        assertThat(shutdown.getPhase()).isEqualTo(Integer.MAX_VALUE).isEqualTo(SmartLifecycle.DEFAULT_PHASE);
        assertThat(shutdown.isRunning()).isFalse();

        shutdown.start();
        assertThat(shutdown.isRunning()).isTrue();

        shutdown.stop();
        assertThat(shutdown.isRunning()).isFalse();
    }
}
