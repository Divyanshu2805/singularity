package com.singularity.intelligence.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * What a build turn runs on.
 *
 * <p>Handles: registering the turn's limits and the model each kind of call asks for, and the executor every turn is handed to - one virtual thread per turn,
 * interrupted when the application stops so a shutdown is not held up by a turn that could run for minutes yet.
 *
 * <p>A turn blocks for minutes: on the model's stream, on the calls that save its files, on a pause before retrying a
 * rate-limited provider. Running that on the shared reactive scheduler would hold one of its few threads for the whole
 * turn, and the AI library runs the model's own file reads on that same scheduler - enough turns at once and the reads
 * they are waiting for could never start. A virtual thread costs nothing to park, so the number of turns in flight
 * stops mattering.
 */
@Configuration
@EnableConfigurationProperties({GenerationProperties.class, AiCallProperties.class})
public class GenerationConfig {

    @Bean(destroyMethod = "shutdownNow")
    public ExecutorService generationExecutor() {
        return Executors.newThreadPerTaskExecutor(Thread.ofVirtual().name("build-turn-", 0).factory());
    }
}
