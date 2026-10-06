package com.singularity.intelligence.config;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.reactive.function.client.WebClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the Gemini tool-call fix on the wire: what a server actually receives through each of the AI library's two
 * HTTP paths. A Gemini 3 model rejects the request that follows a tool call unless the call carries a signature, and
 * the library sends none, so every build that read a file ended in a 400. These tests send real requests to a local
 * server rather than checking the rewrite function alone, because the rewrite is only half of it: the body's length
 * header must change with it, or the server sees a truncated request.
 */
class GeminiToolCallCompatTest {

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private static final String WITH_TOOL_CALL = """
            {"model":"gemini-3.8-flash","messages":[
              {"role":"system","content":"You are a coder."},
              {"role":"user","content":"Read src/App.tsx"},
              {"role":"assistant","content":"","tool_calls":[
                {"id":"call_1","type":"function","function":{"name":"read_files","arguments":"{\\"paths\\":[\\"src/App.tsx\\"]}"}},
                {"id":"call_2","type":"function","function":{"name":"read_files","arguments":"{\\"paths\\":[\\"src/main.tsx\\"]}"}}]},
              {"role":"tool","tool_call_id":"call_1","content":"export const App = () => null;"}]}
            """;

    private static final String NO_TOOL_CALL = "{\"model\":\"gemini-3.8-flash\",\"messages\":[{\"role\":\"user\",\"content\":\"Say OK\"}]}";

    private HttpServer server;
    private final AtomicReference<String> received = new AtomicReference<>();
    private final AtomicReference<String> receivedPath = new AtomicReference<>();

    @BeforeEach
    void startServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            received.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            receivedPath.set(exchange.getRequestURI().getPath());
            byte[] reply = "{}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, reply.length);
            exchange.getResponseBody().write(reply);
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    private String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort() + "/v1beta/openai";
    }

    private RestClient restClient() {
        RestClient.Builder builder = RestClient.builder().baseUrl(baseUrl());
        new GeminiToolCallCompat().geminiToolCallRestClientCustomizer().customize(builder);
        return builder.build();
    }

    private WebClient webClient() {
        WebClient.Builder builder = WebClient.builder().baseUrl(baseUrl());
        new GeminiToolCallCompat().geminiToolCallWebClientCustomizer().customize(builder);
        return builder.build();
    }

    private static List<JsonNode> toolCallsOf(String body) {
        JsonNode root = MAPPER.readTree(body);
        for (JsonNode message : root.path("messages")) {
            if ("assistant".equals(message.path("role").asString(""))) {
                return message.path("tool_calls").valueStream().toList();
            }
        }
        return List.of();
    }

    private static void assertEveryToolCallIsSigned(String body) {
        List<JsonNode> calls = toolCallsOf(body);
        assertThat(calls).hasSize(2);
        for (JsonNode call : calls) {
            assertThat(call.path("extra_content").path("google").path("thought_signature").asString(""))
                    .isEqualTo(GeminiToolCallCompat.BYPASS_SIGNATURE);
            assertThat(call.path("function").path("name").asString("")).isEqualTo("read_files");
        }
    }

    @Test
    @DisplayName("the plain client signs every tool call, and the whole body arrives intact")
    void restClientSignsToolCalls() {
        restClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).body(WITH_TOOL_CALL).retrieve().toBodilessEntity();

        assertEveryToolCallIsSigned(received.get());
        assertThat(MAPPER.readTree(received.get()).path("messages")).hasSize(4);
    }

    @Test
    @DisplayName("the streaming client signs every tool call, and the whole body arrives intact")
    void webClientSignsToolCalls() {
        webClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).bodyValue(WITH_TOOL_CALL).retrieve().toBodilessEntity().block();

        assertEveryToolCallIsSigned(received.get());
        assertThat(MAPPER.readTree(received.get()).path("messages")).hasSize(4);
    }

    @Test
    @DisplayName("the streaming client also signs a body the library encodes from an object, as it does for a real build")
    void webClientSignsAnEncodedObject() {
        Map<?, ?> asObject = MAPPER.readValue(WITH_TOOL_CALL, Map.class);

        webClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON)
                .body(reactor.core.publisher.Mono.just(asObject), Map.class).retrieve().toBodilessEntity().block();

        assertEveryToolCallIsSigned(received.get());
    }

    @Test
    @DisplayName("a real signature already on a tool call is kept, not replaced")
    void aRealSignatureIsKept() {
        String signed = WITH_TOOL_CALL.replaceFirst("\"id\":\"call_1\"",
                "\"id\":\"call_1\",\"extra_content\":{\"google\":{\"thought_signature\":\"REAL\"}}");

        restClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).body(signed).retrieve().toBodilessEntity();

        List<JsonNode> calls = toolCallsOf(received.get());
        assertThat(calls.get(0).path("extra_content").path("google").path("thought_signature").asString("")).isEqualTo("REAL");
        assertThat(calls.get(1).path("extra_content").path("google").path("thought_signature").asString(""))
                .isEqualTo(GeminiToolCallCompat.BYPASS_SIGNATURE);
    }

    @Test
    @DisplayName("a request with no tool calls, such as the interview, is sent exactly as it was")
    void aRequestWithoutToolCallsIsUntouched() {
        restClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).body(NO_TOOL_CALL).retrieve().toBodilessEntity();
        assertThat(received.get()).isEqualTo(NO_TOOL_CALL);

        webClient().post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON).bodyValue(NO_TOOL_CALL).retrieve().toBodilessEntity().block();
        assertThat(received.get()).isEqualTo(NO_TOOL_CALL);
    }

    @Test
    @DisplayName("a request to anything but a chat completion is never rewritten")
    void otherEndpointsAreUntouched() {
        restClient().post().uri("/embeddings").contentType(MediaType.APPLICATION_JSON).body(WITH_TOOL_CALL).retrieve().toBodilessEntity();

        assertThat(receivedPath.get()).endsWith("/embeddings");
        assertThat(received.get()).isEqualTo(WITH_TOOL_CALL);
    }

    @Test
    @DisplayName("a body that is not JSON is passed through rather than failing the request")
    void aNonJsonBodyPassesThrough() {
        assertThat(GeminiToolCallCompat.addSignatures("not json".getBytes(StandardCharsets.UTF_8)))
                .isEqualTo("not json".getBytes(StandardCharsets.UTF_8));
        assertThat(GeminiToolCallCompat.addSignatures(new byte[0])).isEmpty();
    }
}
