package com.singularity.workspace.config;

import com.sun.net.httpserver.HttpServer;
import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the HTTP client the MinIO client is built on.
 *
 * <p>The SDK sends every call through OkHttp's asynchronous dispatcher, whose default lets five calls run at once to
 * one host - and every project file is on one host, so file reads queued five at a time. This pins that the client
 * lets more storage calls than that run together, against a local server that answers none of them until ten are in
 * flight at once, and that it keeps the SDK's own five-minute timeouts.
 */
class StorageConfigTest {

    private static final int AT_ONCE = 10;

    private HttpServer server;
    private final CountDownLatch allArrived = new CountDownLatch(AT_ONCE);

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            allArrived.countDown();
            try {
                boolean together = allArrived.await(5, TimeUnit.SECONDS);
                exchange.sendResponseHeaders(together ? 200 : 503, -1);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                exchange.sendResponseHeaders(500, -1);
            }
            exchange.close();
        });
        server.setExecutor(Executors.newFixedThreadPool(AT_ONCE * 2));
        server.start();
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
    }

    @Test
    void manyStorageCallsRunAtOnce() throws InterruptedException {
        OkHttpClient client = StorageConfig.storageHttpClient();
        String url = "http://127.0.0.1:" + server.getAddress().getPort() + "/bucket/object";
        AtomicInteger answered = new AtomicInteger();
        CountDownLatch finished = new CountDownLatch(AT_ONCE);

        for (int call = 0; call < AT_ONCE; call++) {
            client.newCall(new Request.Builder().url(url).build()).enqueue(new Callback() {
                @Override
                public void onResponse(Call call, Response response) {
                    if (response.code() == 200) answered.incrementAndGet();
                    response.close();
                    finished.countDown();
                }

                @Override
                public void onFailure(Call call, IOException e) {
                    finished.countDown();
                }
            });
        }

        assertThat(finished.await(15, TimeUnit.SECONDS)).isTrue();
        assertThat(answered).hasValue(AT_ONCE);
        assertThat(client.dispatcher().getMaxRequestsPerHost()).isEqualTo(StorageConfig.MAX_CONCURRENT_CALLS);
    }

    @Test
    void keepsTheSdksOwnTimeouts() {
        OkHttpClient client = StorageConfig.storageHttpClient();

        assertThat(client.connectTimeoutMillis()).isEqualTo(TimeUnit.MINUTES.toMillis(5));
        assertThat(client.readTimeoutMillis()).isEqualTo(TimeUnit.MINUTES.toMillis(5));
        assertThat(client.writeTimeoutMillis()).isEqualTo(TimeUnit.MINUTES.toMillis(5));
    }
}
