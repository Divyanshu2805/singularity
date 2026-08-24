package com.vibecraft.intelligence.util;

import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;

import java.time.Duration;

/**
 * Keeps a streaming HTTP response alive by interleaving SSE comment lines into an otherwise-idle stream.
 *
 * <p>Handles: an AI turn can go tens of seconds between tokens while the model "thinks" - long enough that
 * Cloudflare's own idle-connection timeout (100s with no bytes sent) would sever the tunnel mid-generation, handing
 * the browser a 524 with no way to tell a real failure from an active model still working. An SSE comment
 * ({@code : keep-alive}) carries no {@code event:}/{@code data:} field, so it's invisible to EventSource's own
 * parsing - ignored by anything listening for a named or default event - but its bytes reset every idle-timeout
 * clock sitting between here and the browser.
 *
 * <p>Built on {@link Flux#publish(java.util.function.Function)} specifically so the source is subscribed to exactly
 * once: the heartbeat's own stop condition ({@code shared.then()}) observes the SAME subscription the caller's data
 * is forwarded from, rather than opening a second one. A source backed by a live AI generation must never be
 * subscribed to twice - a second subscription would mean starting, and billing, that generation again.
 */
public final class SseHeartbeat {

    public static final Duration DEFAULT_INTERVAL = Duration.ofSeconds(20);

    private SseHeartbeat() {
    }

    public static <T> Flux<ServerSentEvent<T>> withHeartbeat(Flux<ServerSentEvent<T>> source) {
        return source.publish(shared -> shared.mergeWith(
                Flux.interval(DEFAULT_INTERVAL)
                        .map(tick -> SseHeartbeat.<T>comment())
                        .takeUntilOther(shared.then())));
    }

    private static <T> ServerSentEvent<T> comment() {
        return ServerSentEvent.<T>builder().comment("keep-alive").build();
    }
}
