package com.singularity.intelligence.controller;

import com.singularity.intelligence.dto.chat.ChatRequest;
import com.singularity.intelligence.dto.chat.GenerationSignal;
import com.singularity.intelligence.dto.chat.StreamResponse;
import com.singularity.intelligence.service.AiGenerationService;
import com.singularity.intelligence.service.ChatService;
import org.junit.jupiter.api.Test;
import org.springframework.http.codec.ServerSentEvent;
import reactor.core.publisher.Flux;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers what a build turn looks like on the wire: which signal becomes which server-sent event.
 *
 * <p>The browser tells the kinds apart by event name alone, and every one carries the same {@code text} body, so the
 * names are the contract. A piece of the answer must stay an unnamed event, as it has always been, or an older page
 * still open in someone's tab would stop showing text.
 */
class ChatControllerStreamTest {

    private final AiGenerationService aiGenerationService = mock(AiGenerationService.class);
    private final ChatController controller = new ChatController(aiGenerationService, mock(ChatService.class),
            mock(com.singularity.intelligence.service.SuggestionService.class));

    private List<ServerSentEvent<StreamResponse>> events(Flux<GenerationSignal> signals) {
        when(aiGenerationService.streamResponse("build it", 1L, false)).thenReturn(signals);
        return controller.streamChat(new ChatRequest("build it", 1L, null)).collectList().block();
    }

    @Test
    void aTurnAskedForInTeachingModeIsStartedAsOne() {
        when(aiGenerationService.streamResponse("build it", 1L, true)).thenReturn(Flux.just(GenerationSignal.done("SAVED")));

        List<ServerSentEvent<StreamResponse>> events = controller.streamChat(new ChatRequest("build it", 1L, true)).collectList().block();

        assertThat(events).extracting(ServerSentEvent::event).containsExactly("done");
    }

    @Test
    void eachKindOfSignalHasItsOwnEventNameAndTextIsLeftUnnamed() {
        List<ServerSentEvent<StreamResponse>> events = events(Flux.just(
                GenerationSignal.text("<message>Plan.</message>"),
                GenerationSignal.status("Reading 2 files"),
                GenerationSignal.replace("<message>Plan.</message>"),
                GenerationSignal.done("SAVED")));

        assertThat(events).extracting(ServerSentEvent::event).containsExactly(null, "status", "replace", "done");
        assertThat(events).extracting(event -> event.data().text())
                .containsExactly("<message>Plan.</message>", "Reading 2 files", "<message>Plan.</message>", "SAVED");
    }

    @Test
    void aCorrectionToEmptyTextStillCarriesABodyTheClientCanRead() {
        List<ServerSentEvent<StreamResponse>> events = events(Flux.just(GenerationSignal.replace("")));

        assertThat(events.getFirst().event()).isEqualTo("replace");
        assertThat(events.getFirst().data().text()).isEmpty();
    }

    @Test
    void aTurnThatCouldNotBeSavedEndsWithAnErrorEventInsteadOfAnHttpFailure() {
        List<ServerSentEvent<StreamResponse>> events = events(Flux.concat(
                Flux.just(GenerationSignal.text("<message>Plan.</message>")),
                Flux.error(new IllegalStateException("database down"))));

        assertThat(events).extracting(ServerSentEvent::event).containsExactly(null, "error");
        assertThat(events.getLast().data().text()).contains("couldn't be saved").doesNotContain("database down");
    }

    @Test
    void reattachingStreamsTheSameEventsAndAnswersNoContentWhenNothingIsRunning() {
        when(aiGenerationService.watchActiveGeneration(1L)).thenReturn(Optional.of(Flux.just(GenerationSignal.done("SAVED"))));
        when(aiGenerationService.watchActiveGeneration(2L)).thenReturn(Optional.empty());

        var running = controller.watchActiveGeneration(1L);
        var idle = controller.watchActiveGeneration(2L);

        assertThat(running.getStatusCode().value()).isEqualTo(200);
        assertThat(running.getBody().collectList().block()).extracting(ServerSentEvent::event).containsExactly("done");
        assertThat(idle.getStatusCode().value()).isEqualTo(204);
    }
}
