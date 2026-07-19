package com.vibecraft.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The default (post-cutover) route table: every domain goes to its own service through Eureka. Eureka is switched
 * off for the test - {@code lb://} URIs are only resolved when a request is actually forwarded, and this test never
 * forwards one. No database, no server, so none of the reasons the other services avoid {@code @SpringBootTest}
 * apply here.
 */
@SpringBootTest(properties = {
        "eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false"
})
class RoutingTableTest extends AbstractRouteTableTest {

    @Test
    @DisplayName("each domain resolves to its own service by Eureka name")
    void domainsGoToTheirOwnServices() {
        assertThat(uriOf(ACCOUNT)).isEqualTo(URI.create("lb://account-service"));
        assertThat(uriOf(WORKSPACE)).isEqualTo(URI.create("lb://workspace-service"));
        assertThat(uriOf(INTELLIGENCE)).isEqualTo(URI.create("lb://intelligence-service"));
        assertThat(uriOf(INTELLIGENCE_CODE)).isEqualTo(URI.create("lb://intelligence-service"));
    }
}
