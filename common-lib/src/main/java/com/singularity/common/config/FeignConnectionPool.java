package com.singularity.common.config;

import org.apache.hc.core5.util.TimeValue;
import org.springframework.cloud.openfeign.clientconfig.HttpClient5FeignConfiguration.HttpClientBuilderCustomizer;

import java.time.Duration;

/**
 * How long a pooled connection to another service may sit idle before the client closes it.
 *
 * <p>Handles: the one setting Spring Cloud OpenFeign's Apache HttpClient 5 pool does not make itself - closing idle
 * connections - so the pool never hands a call a connection the far end has already closed. A service's Tomcat closes
 * a keep-alive connection idle for 60 seconds; the pool sweeps every IDLE and closes what has been idle that long, so
 * nothing it keeps is older than twice IDLE. It is the rule the Gateway's own pool follows, for the same reason
 * (docs/practices/gotchas/microservices-and-build.md).
 *
 * <p>Every Feign call used to go through the JDK's HttpURLConnection, because feign-hc5 was not on the classpath and
 * Spring Cloud OpenFeign falls back to it without a word. That client keeps five idle connections per host, so a
 * service making more calls at once than that opened a new connection for nearly every call - intelligence-service's
 * membership check on every chat read among them. Under load the closed ones waited out TIME_WAIT faster than they
 * were made, and the machine ran out of local ports: the load test's chat reads failed one in five with
 * "BindException: Address already in use" (docs/practices/product-numbers.md#read-throughput). The pool's size and
 * how long a call may wait for one of its connections are plain properties in each service's application.yaml
 * (spring.cloud.openfeign.httpclient).
 *
 * <p>Not a component: registered by CommonLibAutoConfiguration, like every bean in this module.
 */
public final class FeignConnectionPool {

    public static final Duration IDLE = Duration.ofSeconds(15);

    private FeignConnectionPool() {
    }

    public static HttpClientBuilderCustomizer closeIdleConnections(Duration idle) {
        return builder -> builder.evictIdleConnections(TimeValue.ofMilliseconds(idle.toMillis()));
    }
}
