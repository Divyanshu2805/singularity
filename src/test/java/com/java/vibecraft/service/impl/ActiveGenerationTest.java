package com.java.vibecraft.service.impl;

import com.java.vibecraft.dto.chat.StreamResponse;
import com.java.vibecraft.error.ConflictException;
import org.junit.jupiter.api.Test;
import reactor.core.Disposable;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ActiveGenerationTest {

    private static String joined(List<StreamResponse> chunks) {
        return String.join("", chunks.stream().map(StreamResponse::text).toList());
    }

    @Test
    void aViewerWhoArrivesLateGetsEverythingSoFarThenTheRestExactlyOnce() {
        ActiveGeneration generation = new ActiveGeneration(1L, 2L, "build it", false);
        generation.append("<message>Hel");
        generation.append("lo</message>");

        List<StreamResponse> seen = new CopyOnWriteArrayList<>();
        generation.watch().subscribe(seen::add);

        generation.append("<file path=\"a\">x</file>");
        generation.markStreamComplete();

        assertThat(joined(seen)).isEqualTo("<message>Hello</message><file path=\"a\">x</file>");
    }

    @Test
    void closingAViewerDoesNotEndTheGenerationForAnyoneElse() {
        ActiveGeneration generation = new ActiveGeneration(1L, 2L, "build it", false);
        List<StreamResponse> refreshedTab = new CopyOnWriteArrayList<>();

        Disposable closedTab = generation.watch().subscribe(chunk -> { });
        generation.append("one ");
        closedTab.dispose();
        generation.append("two");

        generation.watch().subscribe(refreshedTab::add);
        generation.markStreamComplete();

        assertThat(joined(refreshedTab)).isEqualTo("one two");
        assertThat(generation.status()).isEqualTo(ActiveGeneration.Status.SAVING);
    }

    @Test
    void attachingWhileTheTurnIsSavingReplaysItAndCompletes() {
        ActiveGeneration generation = new ActiveGeneration(1L, 2L, "build it", false);
        generation.append("done");
        generation.markStreamComplete();

        List<StreamResponse> seen = generation.watch().collectList().block(Duration.ofSeconds(1));

        assertThat(joined(seen)).isEqualTo("done");
    }

    @Test
    void stoppingDisposesTheModelCallAndTellsEveryViewer() {
        ActiveGeneration generation = new ActiveGeneration(1L, 2L, "build it", false);
        AtomicBoolean modelCallDisposed = new AtomicBoolean();
        generation.setSubscription(new Disposable() {
            @Override
            public void dispose() {
                modelCallDisposed.set(true);
            }
        });
        AtomicBoolean viewerSawStop = new AtomicBoolean();
        generation.watch().subscribe(chunk -> { }, error -> viewerSawStop.set(error instanceof GenerationStoppedException));

        generation.stop(new GenerationStoppedException());
        generation.append("ignored after stop");

        assertThat(modelCallDisposed).isTrue();
        assertThat(viewerSawStop).isTrue();
    }

    @Test
    void onlyOneGenerationPerProjectAndUserAndCleanupNeverRemovesANewerOne() {
        GenerationRegistry registry = new GenerationRegistry();
        ActiveGeneration first = registry.start(1L, 2L, "a", false);

        assertThatThrownBy(() -> registry.start(1L, 2L, "b", false)).isInstanceOf(ConflictException.class);
        // Another member of the same project has their own slot.
        assertThat(registry.start(1L, 3L, "c", false)).isNotNull();

        registry.remove(first);
        ActiveGeneration second = registry.start(1L, 2L, "d", false);
        registry.remove(first); // a late cleanup of the old one
        assertThat(registry.find(1L, 2L)).containsSame(second);
    }
}
