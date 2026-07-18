package com.vibecraft.workspace.security;

import com.vibecraft.common.jwt.InternalServiceAuthFilter;
import jakarta.servlet.DispatcherType;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * Modeled on account-service's own {@code WebSecurityConfig} (same CSRF/CORS/security-header/rate-limit shape,
 * same reasoning for why it's NOT delegated to gateway-service yet — see docs/migration/phase-1-account-service.md's Phase 1/2
 * entries), trimmed for what workspace-service actually has: no {@code /webhooks/**} (no billing here), no
 * public GET route (every {@code /api/projects/**}/{@code /api/previews} route requires a session), and no
 * {@code User} entity, so no {@code passwordEncoder()} bean either — account-service only carries that to
 * satisfy {@code User.password}'s NOT NULL column, which doesn't exist here.
 */
@Configuration
@RequiredArgsConstructor
@EnableMethodSecurity
@EnableConfigurationProperties(AuthProperties.class)
public class WebSecurityConfig {

    static final String CONTENT_SECURITY_POLICY =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                    + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    private final SessionAuthenticator sessionAuthenticator;
    private final SessionCookies sessionCookies;
    private final HandlerExceptionResolver handlerExceptionResolver;
    private final InternalServiceAuthFilter internalServiceAuthFilter;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity httpSecurity) {
        SessionAuthFilter sessionAuthFilter = new SessionAuthFilter(
                sessionAuthenticator, sessionCookies, handlerExceptionResolver);
        RateLimitFilter rateLimitFilter = new RateLimitFilter(new RateLimiter(), handlerExceptionResolver);

        httpSecurity
                .csrf(csrf -> csrf
                        .spa()
                        // /internal/** is a machine-to-machine call authenticated by the shared internal-service
                        // secret, structurally unable to carry a browser's CSRF header.
                        .ignoringRequestMatchers("/internal/**"))
                .cors(Customizer.withDefaults())
                .sessionManagement(sessionConfig -> sessionConfig.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000))
                        .addHeaderWriter((request, response) -> response.setHeader("Permissions-Policy",
                                "camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
                        .addHeaderWriter((request, response) -> response.setHeader("Cross-Origin-Opener-Policy", "same-origin")))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(sessionAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(internalServiceAuthFilter, SessionAuthFilter.class)
                .addFilterAfter(rateLimitFilter, InternalServiceAuthFilter.class)
                .exceptionHandling(exceptionHandlingConfigurer -> exceptionHandlingConfigurer
                        .authenticationEntryPoint((request, response, authException) ->
                                handlerExceptionResolver.resolveException(request, response, null,
                                        new InsufficientAuthenticationException("You need to sign in to do that.")))
                        .accessDeniedHandler((request, response, accessDeniedException) ->
                                handlerExceptionResolver.resolveException(request, response, null, accessDeniedException)));

        return httpSecurity.build();
    }
}
