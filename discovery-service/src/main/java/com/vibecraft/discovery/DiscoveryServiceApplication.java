package com.vibecraft.discovery;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.netflix.eureka.server.EnableEurekaServer;

/**
 * discovery-service's entry point: the Eureka server the other services register with.
 *
 * <p>Handles: starting Eureka. The Gateway resolves the three domain services through it, and account-service finds
 * every instance of the others through it when broadcasting a session eviction. Start it before anything else.
 */
@SpringBootApplication
@EnableEurekaServer
public class DiscoveryServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(DiscoveryServiceApplication.class, args);
    }
}
