package com.singularity.workspace.config;

import io.minio.MinioClient;
import io.minio.http.HttpUtils;
import lombok.Data;
import okhttp3.ConnectionPool;
import okhttp3.Dispatcher;
import okhttp3.OkHttpClient;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.concurrent.TimeUnit;

/**
 * The MinIO client every project file is read and written through.
 *
 * <p>Handles: binding the endpoint and credentials from the minio properties and building the client, on an HTTP
 * client that lets MAX_CONCURRENT_CALLS storage calls run at once.
 *
 * <p>The MinIO SDK sends every call through OkHttp's asynchronous dispatcher, even the blocking methods this service
 * uses, and the client it builds for itself keeps OkHttp's default of five calls at a time to one host. Every file
 * lives on one host, so a sixth file read waited for one of the five to finish: under load the file-content endpoint
 * stopped at about 350 reads a second with its request threads parked on the SDK's futures, whatever else was free
 * (docs/practices/product-numbers.md#read-throughput). The client here is the SDK's own default - its five-minute
 * timeouts and HTTP/1.1 - with a dispatcher and a connection pool sized for more calls than that. Tomcat's 200 request
 * threads are still the outer bound; past MAX_CONCURRENT_CALLS a storage call waits in the dispatcher's queue.
 */
@Configuration
@ConfigurationProperties(prefix = "minio")
@Data
public class StorageConfig {

    static final int MAX_CONCURRENT_CALLS = 64;

    private static final long TIMEOUT_MILLIS = Duration.ofMinutes(5).toMillis();

    private String url;
    private String accessKey;
    private String secretKey;

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(url)
                .credentials(accessKey, secretKey)
                .httpClient(storageHttpClient())
                .build();
    }

    static OkHttpClient storageHttpClient() {
        Dispatcher dispatcher = new Dispatcher();
        dispatcher.setMaxRequests(MAX_CONCURRENT_CALLS);
        dispatcher.setMaxRequestsPerHost(MAX_CONCURRENT_CALLS);
        return HttpUtils.newDefaultHttpClient(TIMEOUT_MILLIS, TIMEOUT_MILLIS, TIMEOUT_MILLIS).newBuilder()
                .dispatcher(dispatcher)
                .connectionPool(new ConnectionPool(MAX_CONCURRENT_CALLS, 5, TimeUnit.MINUTES))
                .build();
    }
}
