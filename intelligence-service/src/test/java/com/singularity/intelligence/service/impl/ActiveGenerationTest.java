package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.chat.GenerationSignal.Kind;
import org.junit.jupiter.api.Test;
import reactor.test.StepVerifier;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what a viewer of a build turn receives and when a turn can be stopped.
 *
 * <p>A viewer's stream used to end when the model stopped writing, before anything was saved. It now runs until the
 * turn is finished and ends with the outcome, which is what lets the browser reload the saved turn instead of trusting
 * its own reading of the text - so the order of signals, and what a viewer who attaches late is told, are pinned here.
 */
class ActiveGenerationTest {

    private final ActiveGeneration generation = new ActiveGeneration(1L, 10L, "build a todo app", Instant.now());

    @Test
    void aViewerSeesTheTextStatusCorrectionAndOutcomeInOrderAndThenTheStreamEnds() {
        StepVerifier.create(generation.watch())
                .then(() -> generation.append("<message>Plan.</message>"))
                .expectNext(GenerationSignal.text("<message>Plan.</message>"))
                .then(() -> generation.announce("Reading 2 files"))
                .expectNext(GenerationSignal.status("Reading 2 files"))
                .then(() -> generation.replaceText("<message>Plan.</message>"))
                .expectNext(GenerationSignal.replace("<message>Plan.</message>"))
                .then(() -> generation.finish("SAVED"))
                .expectNext(GenerationSignal.done("SAVED"))
                .verifyComplete();
    }

    @Test
    void aViewerWhoAttachesLateIsGivenEverythingSoFarAndWhatTheServerIsDoing() {
        generation.append("<message>Plan.</message>");
        generation.append("<file path=\"a.ts\">a</file>");
        generation.announce("Saving your changes");

        StepVerifier.create(generation.watch())
                .expectNext(GenerationSignal.text("<message>Plan.</message><file path=\"a.ts\">a</file>"))
                .expectNext(GenerationSignal.status("Saving your changes"))
                .then(() -> generation.finish("SAVED"))
                .expectNext(GenerationSignal.done("SAVED"))
                .verifyComplete();
    }

    @Test
    void aViewerWhoAttachesAfterTheTurnFinishedStillLearnsHowItEnded() {
        generation.append("<message>Done.</message>");
        generation.finish("ANSWERED");

        StepVerifier.create(generation.watch())
                .expectNext(GenerationSignal.text("<message>Done.</message>"))
                .expectNext(GenerationSignal.done("ANSWERED"))
                .verifyComplete();
    }

    @Test
    void aTurnThatCouldNotBeSavedEndsEveryViewersStreamWithTheFailure() {
        StepVerifier.create(generation.watch())
                .then(() -> generation.fail(new IllegalStateException("database down")))
                .verifyErrorMessage("database down");

        assertThat(generation.awaitFinished(Duration.ofMillis(10))).isTrue();
        assertThat(generation.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void stoppingCancelsTheModelCallOnceAndNothingWrittenAfterwardsIsKept() {
        AtomicInteger cancelled = new AtomicInteger();
        generation.onCancel(cancelled::incrementAndGet);
        generation.append("<message>Plan.</message>");

        assertThat(generation.requestStop()).isTrue();
        assertThat(generation.requestStop()).isFalse();
        generation.append("<file path=\"a.ts\">late</file>");

        assertThat(cancelled).hasValue(1);
        assertThat(generation.stopRequested()).isTrue();
        assertThat(generation.text()).isEqualTo("<message>Plan.</message>");
        assertThat(generation.beginSaving()).isFalse();
    }

    @Test
    void beingAbandonedByTheServerIsAStopThatRemembersWhoAskedForIt() {
        AtomicInteger cancelled = new AtomicInteger();
        generation.onCancel(cancelled::incrementAndGet);

        assertThat(generation.abandon()).isTrue();

        assertThat(cancelled).hasValue(1);
        assertThat(generation.stopRequested()).isTrue();
        assertThat(generation.abandoned()).isTrue();
        assertThat(generation.abandon()).isFalse();
    }

    @Test
    void aStopThePersonAskedForIsNotMistakenForOneTheServerMade() {
        generation.requestStop();

        assertThat(generation.abandoned()).isFalse();
        assertThat(generation.abandon()).isFalse();
        assertThat(generation.abandoned()).isFalse();
    }

    @Test
    void aModelCallThatStartsAfterAStopWasRequestedIsCancelledStraightAway() {
        generation.requestStop();
        AtomicInteger cancelled = new AtomicInteger();

        generation.onCancel(cancelled::incrementAndGet);

        assertThat(cancelled).hasValue(1);
    }

    @Test
    void aTurnThatHasBegunSavingCanNoLongerBeStopped() {
        assertThat(generation.beginSaving()).isTrue();

        assertThat(generation.requestStop()).isFalse();
        assertThat(generation.stopRequested()).isFalse();
        assertThat(generation.status()).isEqualTo(ActiveGeneration.Status.SAVING);
    }

    @Test
    void readingFilesIsRecordedInTheTextAndAnnouncedWhetherOrNotTheModelSaidSo() {
        List<GenerationSignal> seen = new java.util.ArrayList<>();
        generation.watch().subscribe(seen::add);

        generation.filesRead(List.of("./src/App.tsx", "src/main.tsx", "src/App.tsx"));

        assertThat(generation.text()).isEqualTo("<tool args=\"src/App.tsx,src/main.tsx\">Reading 2 files</tool>");
        assertThat(seen).extracting(GenerationSignal::kind).containsExactly(Kind.TEXT, Kind.STATUS);
        assertThat(seen.get(1).text()).isEqualTo("Reading 2 files");
    }

    @Test
    void aPathThatCouldBreakTheReadTagIsLeftOutOfIt() {
        generation.filesRead(List.of("src/a\"b.ts", "../outside.ts", "src/ok.ts"));

        assertThat(generation.text()).isEqualTo("<tool args=\"src/ok.ts\">Reading 1 file</tool>");
    }

    @Test
    void aReadOfNothingNewSaysNothing() {
        generation.filesRead(List.of());

        assertThat(generation.text()).isEmpty();
    }

    @Test
    void theReservationIsHandedBackExactlyOnce() {
        var reservation = new com.singularity.intelligence.dto.usage.UsageReservation(10L, java.time.LocalDate.now(), 60000);
        generation.setReservation(reservation);

        assertThat(generation.takeReservation()).isSameAs(reservation);
        assertThat(generation.takeReservation()).isNull();
    }
}
