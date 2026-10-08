package com.singularity.intelligence.service.impl;

import com.singularity.common.util.WindowsTimezoneWorkaround;
import com.singularity.intelligence.config.AiCallProperties;
import com.singularity.intelligence.config.GenerationProperties;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.service.impl.BuildBenchmark.Measured;
import com.singularity.intelligence.service.impl.BuildBenchmark.Prices;
import com.singularity.intelligence.service.impl.BuildBenchmark.Scenario;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Runs the build benchmark against the model the service is configured with. It spends real tokens.
 *
 * <p>Handles: starting the service's own context so the chat client, its provider settings and the per-call model
 * choices are the real ones; running the fixed scenarios through {@link BuildBenchmark}; and writing the report.
 *
 * <p>It is not part of the test suite: its name keeps the build from picking it up, and it runs only when asked for
 * by name. Nothing is saved anywhere but the output folder, no sign-in is needed, and workspace-service is not
 * contacted - each scenario's project lives in memory.
 *
 * <pre>
 * ./mvnw -pl common-lib,intelligence-service test -Dtest=BuildBenchmarkIT -Dsurefire.failIfNoSpecifiedTests=false \
 *   "-DargLine=-Dbench.out=C:/path/to/out -Dbench.label=gemini-3.8-flash"
 * </pre>
 *
 * <p>Further settings go in the same {@code argLine}, since a plain {@code -D} does not reach the forked test JVM:
 * {@code -Dbench.only=todo-build,todo-dark-theme} to run some scenarios (a change needs its chain's first build),
 * {@code -Dspring.ai.openai.chat.options.model=...} to measure another model, {@code -Dai.calls.build.reasoning-effort=low}
 * for a call kind's settings, and {@code -Dbench.price.input}, {@code -Dbench.price.cached} and
 * {@code -Dbench.price.output} - dollars per million tokens - to add a cost column.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.config.import=optional:file:${bench.env:../.env}[.properties]",
        "eureka.client.enabled=false",
        "management.server.port=0",
        "spring.jpa.show-sql=false"
})
class BuildBenchmarkIT {

    @Autowired
    private ChatClient chatClient;
    @Autowired
    private GenerationProperties generationProperties;
    @Autowired
    private AiCallProperties callProperties;

    @MockitoBean
    private WorkspaceServiceClient workspaceServiceClient;

    @Value("${bench.out:target/bench}")
    private String out;
    @Value("${bench.label:${spring.ai.openai.chat.options.model}}")
    private String label;
    @Value("${bench.only:}")
    private String only;
    @Value("${bench.price.input:0}")
    private double inputPrice;
    @Value("${bench.price.cached:0}")
    private double cachedPrice;
    @Value("${bench.price.output:0}")
    private double outputPrice;

    @BeforeAll
    static void useATimeZonePostgresAccepts() {
        WindowsTimezoneWorkaround.apply();
    }

    @Test
    void measureTheBuildPipeline() {
        List<String> chosen = Arrays.stream(only.split(",")).map(String::strip).filter(id -> !id.isEmpty()).toList();
        List<Scenario> scenarios = BuildBenchmark.scenarios().stream()
                .filter(scenario -> chosen.isEmpty() || chosen.contains(scenario.id()))
                .toList();
        assertThat(scenarios).as("scenarios chosen by -Dbench.only").isNotEmpty();

        Path folder = Path.of(out);
        List<Measured> results = new BuildBenchmark(chatClient, generationProperties, callProperties)
                .run(scenarios, folder, System.out::println);
        BuildBenchmark.write(folder, label, results, new Prices(inputPrice, cachedPrice, outputPrice));
        System.out.println(BuildBenchmark.report(label, results, new Prices(inputPrice, cachedPrice, outputPrice)));
    }
}
