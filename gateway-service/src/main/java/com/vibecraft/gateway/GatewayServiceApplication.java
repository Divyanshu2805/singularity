package com.vibecraft.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * gateway-service's entry point: the single origin the browser talks to.
 *
 * <p>Handles: starting the Spring Cloud Gateway. It is reactive and non-blocking, which is what lets it pass an SSE
 * stream through without buffering it.
 *
 * <p>The Gateway carries no authentication logic of its own - it is a transparent passthrough with an ordered route
 * table that sends each URL to the service that owns it, configured in application.yaml. Route order is load-bearing,
 * and there is no catch-all: a path nothing owns is a 404 from here.
 */
@SpringBootApplication
public class GatewayServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayServiceApplication.class, args);
    }
}
