package com.vibecraft.gateway;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The rollback switch: {@code --spring.profiles.active=legacy-routing} must send all three domains back to
 * legacy-monolith at once, and leave the path table (inherited from {@link AbstractRouteTableTest}) untouched.
 * If this fails, the one-line rollback in docs/migration/ is not actually one line.
 */
@SpringBootTest(properties = {
        "eureka.client.enabled=false",
        "spring.cloud.discovery.enabled=false"
})
@ActiveProfiles("legacy-routing")
class LegacyRoutingProfileTest extends AbstractRouteTableTest {

    @Test
    @DisplayName("every route, domain and fallback alike, points at legacy-monolith")
    void everythingGoesBackToLegacy() {
        URI legacy = URI.create("http://localhost:8080");
        assertThat(uriOf(ACCOUNT)).isEqualTo(legacy);
        assertThat(uriOf(WORKSPACE)).isEqualTo(legacy);
        assertThat(uriOf(INTELLIGENCE)).isEqualTo(legacy);
        assertThat(uriOf(INTELLIGENCE_CODE)).isEqualTo(legacy);
        assertThat(uriOf(FALLBACK)).isEqualTo(legacy);
    }
}
