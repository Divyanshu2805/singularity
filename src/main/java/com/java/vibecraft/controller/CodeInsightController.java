package com.java.vibecraft.controller;

import com.java.vibecraft.dto.code.AskCodeRequest;
import com.java.vibecraft.dto.code.CodeInsightResponse;
import com.java.vibecraft.dto.code.ExplainCodeRequest;
import com.java.vibecraft.service.CodeInsightService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * The code lens: explain a selection, then talk about it. Both endpoints are read-only and stateless - see
 * {@link CodeInsightService} - so there is no history endpoint here to pair with them.
 */
@RestController
@RequiredArgsConstructor
@Slf4j
@RequestMapping("/api/projects/{projectId}/code")
public class CodeInsightController {

    private final CodeInsightService codeInsightService;

    @PostMapping("/explain")
    public ResponseEntity<CodeInsightResponse> explain(
            @PathVariable Long projectId,
            @RequestBody @Valid ExplainCodeRequest request) {
        return ResponseEntity.ok(codeInsightService.explain(projectId, request));
    }

    @PostMapping(value = "/explain/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamExplain(
            @PathVariable Long projectId,
            @RequestBody @Valid ExplainCodeRequest request) {
        return asEvents(codeInsightService.streamExplain(projectId, request), projectId);
    }

    @PostMapping(value = "/ask/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> streamAsk(
            @PathVariable Long projectId,
            @RequestBody @Valid AskCodeRequest request) {
        return asEvents(codeInsightService.streamAsk(projectId, request), projectId);
    }

    /**
     * A failure mid-stream can't become an HTTP status - the response has already started - so it arrives as a
     * named "error" event the client renders in place, the same shape {@code ChatController} uses.
     */
    private Flux<ServerSentEvent<String>> asEvents(Flux<String> answer, Long projectId) {
        return answer
                .map(text -> ServerSentEvent.builder(text).build())
                .onErrorResume(error -> {
                    log.error("Streaming code insight failed for projectId: {}", projectId, error);
                    return Flux.just(ServerSentEvent.builder("Couldn't get an answer from the AI right now. "
                            + "Please try again.").event("error").build());
                });
    }

    @PostMapping("/ask")
    public ResponseEntity<CodeInsightResponse> ask(
            @PathVariable Long projectId,
            @RequestBody @Valid AskCodeRequest request) {
        return ResponseEntity.ok(codeInsightService.ask(projectId, request));
    }
}
