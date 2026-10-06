package com.singularity.intelligence.config;

import org.reactivestreams.Publisher;
import org.springframework.boot.restclient.RestClientCustomizer;
import org.springframework.boot.webclient.WebClientCustomizer;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.core.io.buffer.DataBufferUtils;
import org.springframework.http.HttpMethod;
import org.springframework.http.client.ClientHttpRequestInterceptor;
import org.springframework.http.client.reactive.ClientHttpRequestDecorator;
import org.springframework.web.reactive.function.client.ExchangeFilterFunction;
import org.springframework.web.reactive.function.client.ClientRequest;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import java.net.URI;

/**
 * Lets a build that reads a file work when the model is a Gemini 3 model behind Google's OpenAI-compatible endpoint.
 *
 * <p>Handles: adding a thought signature to every tool call the app sends back to the model in the next request, on
 * both of the AI library's HTTP paths - the streaming one a build uses and the plain one the code lens uses - and only
 * when spring.ai.openai.base-url points at Google.
 *
 * <p>Why it exists: Gemini 3 models attach a hidden signature to each tool call they make and reject the following
 * request with a 400 ("Function call is missing a thought_signature") unless it is returned. The AI library does not
 * carry that field back, so the second step of every build - the model asks to read a file, the app answers, the
 * request goes out again with that exchange attached - failed, while the interview (no tools) worked. A build then
 * ended in the generic "something went wrong" message. The fix sends Google's documented bypass value, which is meant
 * for conversations whose real signatures are not available; the model still sees the tool call and its result, and
 * Google notes only that reasoning carried between tool steps may be slightly weaker. Passing the real signatures back
 * would avoid even that, and would mean reading them out of the streamed response.
 *
 * <p>The body is rewritten as JSON bytes just before it is sent, so nothing about how the library builds its messages
 * is touched. A tool call that already has a signature is left alone, and a request with no assistant tool calls (the
 * interview, the first step of a build) passes through byte for byte. Requests to anywhere but a chat completion are
 * never touched.
 */
@Configuration
@ConditionalOnExpression("'${spring.ai.openai.base-url:}'.contains('generativelanguage.googleapis.com')")
public class GeminiToolCallCompat {

    static final String BYPASS_SIGNATURE = "skip_thought_signature_validator";

    private static final String CHAT_COMPLETIONS = "/chat/completions";

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    @Bean
    RestClientCustomizer geminiToolCallRestClientCustomizer() {
        ClientHttpRequestInterceptor interceptor = (request, body, execution) ->
                execution.execute(request, isChatCompletion(request.getMethod(), request.getURI()) ? addSignatures(body) : body);
        return builder -> builder.requestInterceptor(interceptor);
    }

    @Bean
    WebClientCustomizer geminiToolCallWebClientCustomizer() {
        return builder -> builder.filter(streamingFilter());
    }

    static ExchangeFilterFunction streamingFilter() {
        return (request, next) -> {
            if (!isChatCompletion(request.method(), request.url())) {
                return next.exchange(request);
            }
            ClientRequest rewritten = ClientRequest.from(request)
                    .body((outputMessage, context) -> request.body().insert(new ClientHttpRequestDecorator(outputMessage) {
                        @Override
                        public Mono<Void> writeWith(Publisher<? extends DataBuffer> body) {
                            return DataBufferUtils.join(body).flatMap(joined -> {
                                byte[] original = new byte[joined.readableByteCount()];
                                joined.read(original);
                                DataBufferUtils.release(joined);
                                byte[] changed = addSignatures(original);
                                getHeaders().setContentLength(changed.length);
                                return super.writeWith(Mono.just(getDelegate().bufferFactory().wrap(changed)));
                            });
                        }

                        @Override
                        public Mono<Void> writeAndFlushWith(Publisher<? extends Publisher<? extends DataBuffer>> body) {
                            return writeWith(Flux.from(body).flatMap(Flux::from));
                        }
                    }, context))
                    .build();
            return next.exchange(rewritten);
        };
    }

    static boolean isChatCompletion(HttpMethod method, URI uri) {
        return HttpMethod.POST.equals(method) && uri != null && uri.getPath() != null && uri.getPath().endsWith(CHAT_COMPLETIONS);
    }

    static byte[] addSignatures(byte[] requestBody) {
        if (requestBody == null || requestBody.length == 0) {
            return requestBody;
        }
        JsonNode root;
        try {
            root = MAPPER.readTree(requestBody);
        } catch (RuntimeException e) {
            return requestBody;
        }
        boolean changed = false;
        for (JsonNode message : root.path("messages")) {
            if (!"assistant".equals(message.path("role").asString(""))) {
                continue;
            }
            for (JsonNode toolCall : message.path("tool_calls")) {
                if (toolCall instanceof ObjectNode call && !hasSignature(call)) {
                    call.putObject("extra_content").putObject("google").put("thought_signature", BYPASS_SIGNATURE);
                    changed = true;
                }
            }
        }
        return changed ? MAPPER.writeValueAsBytes(root) : requestBody;
    }

    private static boolean hasSignature(JsonNode toolCall) {
        return !toolCall.path("extra_content").path("google").path("thought_signature").asString("").isBlank();
    }
}
