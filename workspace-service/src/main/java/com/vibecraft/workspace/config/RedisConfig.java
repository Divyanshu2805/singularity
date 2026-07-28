package com.vibecraft.workspace.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/**
 * The Redis template the preview router reads and writes routes with.
 *
 * <p>Handles: exposing a string-typed template over Spring Boot's auto-configured connection factory. Values are
 * plain strings because the preview proxy, which is Node, reads the same keys.
 */
@Configuration
public class RedisConfig {

    @Bean
    public StringRedisTemplate redisTemplate(RedisConnectionFactory redisConnectionFactory) {
        return new StringRedisTemplate(redisConnectionFactory);
    }
}
