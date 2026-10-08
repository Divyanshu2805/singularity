package com.singularity.intelligence.config;

import com.singularity.intelligence.llm.stub.StubChatModel;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.time.Duration;

/**
 * Swaps the AI provider for a scripted model when the {@code stub-ai} profile is on.
 *
 * <p>Handles: registering {@link StubChatModel} as the service's one chat model, and saying so loudly at start-up.
 *
 * <p>The profile's own properties file ({@code application-stub-ai.yaml}) turns the provider's auto-configuration off,
 * so this is the only chat model in the context and the chat client is built on it with no further wiring. Every
 * call in the service - a build turn, the interview, a lesson, an explanation - then runs its real code path, with its
 * real parsing, saving and metering, against replies that cost nothing.
 *
 * <p>It is for development, tests and demos. Nothing that deploys sets the profile, and the warning is there so a
 * service answering every request with the same notes app is never a mystery.
 */
@Configuration
@Profile("stub-ai")
@Slf4j
public class StubAiConfig {

    @Bean
    public ChatModel stubChatModel(@Value("${ai.stub.chunk-delay:12ms}") Duration chunkDelay) {
        log.warn("The stub-ai profile is on: every AI call is answered from a script and no provider is contacted");
        return new StubChatModel(chunkDelay);
    }
}
