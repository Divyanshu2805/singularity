package com.singularity.intelligence.config;

import com.singularity.intelligence.enums.AiCallKind;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.context.properties.source.ConfigurationPropertySources;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the per-call model settings can be given as environment variables, under the names the deployment uses.
 *
 * <p>Handles: binding {@link AiCallProperties} from the variables deploy/k8s/base/intelligence.yaml sets - a reasoning
 * effort for the build and repair calls, a model for the light ones - and leaving a kind that was not named on the
 * defaults.
 *
 * <p>A deployed service gets these from its pod's environment, not from application.yaml, and a variable under a name
 * that does not bind is ignored without a word: the service starts and calls the default model. If this test fails
 * after a rename, the manifest has to change with it.
 */
class AiCallPropertiesEnvironmentTest {

    private static AiCallProperties bind(Map<String, Object> environment) {
        SystemEnvironmentPropertySource source = new SystemEnvironmentPropertySource(
                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, environment);
        return new Binder(ConfigurationPropertySources.from(source))
                .bind("ai", AiCallProperties.class)
                .orElseGet(AiCallProperties::defaults);
    }

    @Test
    void theDeploymentsVariablesReachTheirCalls() {
        AiCallProperties properties = bind(Map.of(
                "AI_CALLS_BUILD_REASONINGEFFORT", "low",
                "AI_CALLS_REPAIR_REASONINGEFFORT", "low",
                "AI_CALLS_LESSON_MODEL", "gemini-3.5-flash-lite",
                "AI_CALLS_SUGGEST_MODEL", "gemini-3.5-flash-lite"));

        assertThat(properties.of(AiCallKind.BUILD).reasoningEffort()).isEqualTo("low");
        assertThat(properties.of(AiCallKind.BUILD).model()).isNull();
        assertThat(properties.of(AiCallKind.REPAIR).reasoningEffort()).isEqualTo("low");
        assertThat(properties.of(AiCallKind.LESSON).model()).isEqualTo("gemini-3.5-flash-lite");
        assertThat(properties.of(AiCallKind.SUGGEST).model()).isEqualTo("gemini-3.5-flash-lite");
        assertThat(properties.of(AiCallKind.EXPLAIN).isDefault()).isTrue();
    }
}
