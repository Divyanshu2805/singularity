package com.vibecraft.intelligence.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers {@link SseHeartbeat}: real items pass through untouched, a comment-only heartbeat fills a silent stretch
 * longer than the interval, the heartbeat stops the instant the source completes (it never outlives it, and never
 * blocks completion waiting for its own next tick), and - the one property that would be dangerous to get wrong -
 * the source is subscribed to exactly once, since a source backed by a live AI generation must never be started a
 * second time just to derive a completion signal.
 */
class SseHeartbeatTest {

    @Test
    @DisplayName("passes real items through unchanged when the source never goes idle long enough to heartbeat")
    void passesItemsThroughWithoutHeartbeatingAFastStream() {
        Flux<ServerSentEvent<String>> source = Flux.just(event("a"), event("b"), event("c"));

        StepVerifier.create(SseHeartbeat.withHeartbeat(source))
                .expectNextMatches(e -> "a".equals(e.data()))
                .expectNextMatches(e -> "b".equals(e.data()))
                .expectNextMatches(e -> "c".equals(e.data()))
                .verifyComplete();
    }

    @Test
    @DisplayName("emits a comment-only heartbeat during a silent stretch, then resumes real data")
    void heartbeatsDuringAnIdleStretch() {
        // The delayed source must be built INSIDE the withVirtualTime supplier, not before it - Flux.interval and
        // Mono.delay both bind to Schedulers.parallel() at construction time, and only calls made inside the
        // supplier see the virtual scheduler StepVerifier installs in place of the real one.
        StepVerifier.withVirtualTime(() -> SseHeartbeat.withHeartbeat(Flux.concat(
                        Flux.just(event("first")),
                        Mono.delay(Duration.ofSeconds(45)).thenMany(Flux.just(event("second"))))))
                .expectNextMatches(e -> "first".equals(e.data()))
                .thenAwait(Duration.ofSeconds(20))
                .expectNextMatches(SseHeartbeatTest::isHeartbeatComment)
                .thenAwait(Duration.ofSeconds(20))
                .expectNextMatches(SseHeartbeatTest::isHeartbeatComment)
                .thenAwait(Duration.ofSeconds(5))
                .expectNextMatches(e -> "second".equals(e.data()))
                .verifyComplete();
    }

    @Test
    @DisplayName("stops heartbeating the instant the source completes, without waiting out its own next tick")
    void stopsAsSoonAsSourceCompletes() {
        Flux<ServerSentEvent<String>> source = Flux.just(event("only"));

        StepVerifier.withVirtualTime(() -> SseHeartbeat.withHeartbeat(source))
                .expectNextMatches(e -> "only".equals(e.data()))
                .expectComplete()
                .verify(Duration.ofSeconds(1));
    }

    @Test
    @DisplayName("subscribes to the source exactly once - never twice just to watch for its completion")
    void subscribesToSourceExactlyOnce() {
        AtomicInteger subscriptions = new AtomicInteger();
        Flux<ServerSentEvent<String>> source = Flux.just(event("a"), event("b"))
                .doOnSubscribe(subscription -> subscriptions.incrementAndGet());

        StepVerifier.create(SseHeartbeat.withHeartbeat(source))
                .expectNextCount(2)
                .verifyComplete();

        assertThat(subscriptions).hasValue(1);
    }

    private static boolean isHeartbeatComment(ServerSentEvent<String> event) {
        return event.data() == null && "keep-alive".equals(event.comment());
    }

    private static ServerSentEvent<String> event(String data) {
        return ServerSentEvent.<String>builder(data).build();
    }
}
