package com.singularity.common.config;

import com.sun.net.httpserver.HttpServer;
import feign.Feign;
import feign.RequestLine;
import feign.hc5.ApacheHttp5Client;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.io.HttpClientConnectionManager;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.openfeign.clientconfig.HttpClient5FeignConfiguration;
import org.springframework.cloud.openfeign.support.FeignHttpClientProperties;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Covers the connection pool every Feign call goes through, built the way Spring Cloud OpenFeign builds it.
 *
 * <p>Under load the calls used to open a connection each - the JDK client keeps five idle ones per host - until the
 * machine ran out of local ports and chat reads failed with BindException. This pins that many calls at once share a
 * few connections, and that a connection left idle past the limit is closed and replaced rather than handed out after
 * the far end has dropped it. The far end is a local server that
 * records which connection each call arrived on.
 */
class FeignConnectionPoolTest {

    interface Ping {
        @RequestLine("GET /ping")
        String ping();
    }

    private HttpServer server;
    private final Set<Integer> connections = ConcurrentHashMap.newKeySet();
    private CloseableHttpClient httpClient;

    @BeforeEach
    void startServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/ping", exchange -> {
            connections.add(exchange.getRemoteAddress().getPort());
            byte[] body = "pong".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.setExecutor(Executors.newFixedThreadPool(16));
        server.start();
    }

    @AfterEach
    void stop() throws Exception {
        if (httpClient != null) httpClient.close();
        server.stop(0);
    }

    @SuppressWarnings("unchecked")
    private Ping client(Duration idle) {
        FeignHttpClientProperties properties = new FeignHttpClientProperties();
        HttpClient5FeignConfiguration configuration = new HttpClient5FeignConfiguration();
        ObjectProvider<List<HttpClient5FeignConfiguration.HttpClientConnectionManagerBuilderCustomizer>> managerCustomizers =
                mock(ObjectProvider.class);
        when(managerCustomizers.getIfAvailable(any(Supplier.class))).thenReturn(List.of());
        ObjectProvider<List<HttpClient5FeignConfiguration.HttpClientBuilderCustomizer>> clientCustomizers =
                mock(ObjectProvider.class);
        when(clientCustomizers.getIfAvailable(any(Supplier.class))).thenReturn(List.of(FeignConnectionPool.closeIdleConnections(idle)));

        HttpClientConnectionManager manager = configuration.hc5ConnectionManager(properties, managerCustomizers);
        httpClient = configuration.httpClient5(manager, properties, clientCustomizers);
        return Feign.builder()
                .client(new ApacheHttp5Client(httpClient))
                .decoder((response, type) -> new String(response.body().asInputStream().readAllBytes(), StandardCharsets.UTF_8))
                .target(Ping.class, "http://127.0.0.1:" + server.getAddress().getPort());
    }

    @Test
    void manyCallsAtOnceShareAFewConnections() throws Exception {
        Ping ping = client(FeignConnectionPool.IDLE);
        int threads = 16;
        try (ExecutorService pool = Executors.newFixedThreadPool(threads)) {
            List<Future<?>> calls = new ArrayList<>();
            for (int thread = 0; thread < threads; thread++) {
                calls.add(pool.submit(() -> {
                    for (int call = 0; call < 50; call++) assertThat(ping.ping()).isEqualTo("pong");
                }));
            }
            for (Future<?> call : calls) call.get();
        }

        assertThat(connections).hasSizeLessThanOrEqualTo(threads);
    }

    @Test
    void aConnectionIdlePastTheLimitIsClosedAndReplaced() throws Exception {
        Ping ping = client(Duration.ofMillis(200));
        ping.ping();
        ping.ping();
        assertThat(connections).hasSize(1);

        Thread.sleep(1_000);
        ping.ping();

        assertThat(connections).hasSize(2);
    }

    @Test
    void theIdleLimitIsWellUnderTheTimeTomcatKeepsAnIdleConnection() {
        assertThat(FeignConnectionPool.IDLE.multipliedBy(2)).isLessThan(Duration.ofSeconds(60));
    }
}
