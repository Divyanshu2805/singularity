package com.vibecraft.intelligence.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.SimpleLoggerAdvisor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The Spring AI chat client every model call in this service goes through.
 *
 * <p>Handles: building it from the auto-configured builder with a logging advisor attached.
 *
 * <p>That advisor logs the whole prompt and response at DEBUG, the user's own words included, so be careful before
 * raising this service's log level anywhere shared.
 */
@Configuration
public class AiConfig {

    @Bean
    public ChatClient chatClient(ChatClient.Builder builder) {
        return  builder
                .defaultAdvisors(
                        new SimpleLoggerAdvisor()
                )
                .build();
    }
}
