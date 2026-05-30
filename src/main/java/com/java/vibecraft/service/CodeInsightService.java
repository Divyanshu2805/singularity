package com.java.vibecraft.service;

import com.java.vibecraft.dto.code.AskCodeRequest;
import com.java.vibecraft.dto.code.CodeInsightResponse;
import com.java.vibecraft.dto.code.ExplainCodeRequest;
import reactor.core.publisher.Flux;

/**
 * Explains a selected block of code, and answers follow-up questions about it. Sits alongside teaching mode:
 * teaching mode explains code as it's written, this explains code that's already there, on demand.
 *
 * <p><b>Read-only by construction.</b> Neither method touches {@code ProjectFileService}, and the prompts
 * forbid the {@code <file>} protocol the generation pipeline uses - this can produce text and nothing else.
 *
 * <p><b>Stateless by construction.</b> Nothing is persisted: no {@code ChatMessage}, no {@code ChatEvent}.
 * The conversation lives in the browser for the session and is replayed on each request, so closing the tab
 * ends it. Only the token usage is recorded, since the tokens were really spent.
 */
public interface CodeInsightService {

    CodeInsightResponse explain(Long projectId, ExplainCodeRequest request);

    CodeInsightResponse ask(Long projectId, AskCodeRequest request);

    /** The same answer as {@link #explain}, streamed token by token so it can be read as it arrives. */
    Flux<String> streamExplain(Long projectId, ExplainCodeRequest request);

    /** The same answer as {@link #ask}, streamed token by token. */
    Flux<String> streamAsk(Long projectId, AskCodeRequest request);
}
