package com.vibecraft.common.autoconfigure;

import com.vibecraft.common.error.GlobalExceptionHandler;
import com.vibecraft.common.feign.FeignClientInterceptor;
import com.vibecraft.common.jwt.InternalJwtProperties;
import com.vibecraft.common.jwt.InternalJwtService;
import com.vibecraft.common.jwt.InternalServiceAuthFilter;
import com.vibecraft.common.jwt.JwtAuthFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import com.vibecraft.common.config.AsyncConfig;
import com.vibecraft.common.config.ClockConfig;

/**
 * Registers common-lib's beans on every consuming service without requiring that service to widen its own
 * {@code @ComponentScan} — resolved via Spring Boot's auto-configuration mechanism (see
 * {@code META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports}). Constructing
 * {@code JwtAuthFilter}/{@code InternalServiceAuthFilter} as beans here does not, by itself, put them in
 * any security chain — each service's own {@code SecurityFilterChain} config wires them in at the right
 * position, next to its own {@code SessionAuthFilter}.
 */
@AutoConfiguration
@Import({GlobalExceptionHandler.class, ClockConfig.class, AsyncConfig.class})
@EnableConfigurationProperties(InternalJwtProperties.class)
public class CommonLibAutoConfiguration {

    @Bean
    public InternalJwtService internalJwtService(InternalJwtProperties properties) {
        return new InternalJwtService(properties);
    }

    @Bean
    public JwtAuthFilter jwtAuthFilter(InternalJwtService internalJwtService) {
        return new JwtAuthFilter(internalJwtService);
    }

    @Bean
    public FeignClientInterceptor feignClientInterceptor(
            @Value("${internal-service.shared-secret}") String sharedSecret) {
        return new FeignClientInterceptor(sharedSecret);
    }

    @Bean
    public InternalServiceAuthFilter internalServiceAuthFilter(
            @Value("${internal-service.shared-secret}") String sharedSecret) {
        return new InternalServiceAuthFilter(sharedSecret);
    }
}
