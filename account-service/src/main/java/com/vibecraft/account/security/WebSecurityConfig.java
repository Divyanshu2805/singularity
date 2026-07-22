package com.vibecraft.account.security;

import com.vibecraft.common.jwt.InternalServiceAuthFilter;
import jakarta.servlet.DispatcherType;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * The browser-facing security chain: CSRF ({@code .spa()}), CORS, security headers, rate limiting and session
 * authentication — plus {@code /internal/v1/**}, which is guarded by common-lib's
 * {@link InternalServiceAuthFilter} (a shared secret) instead of a session cookie, since that's how
 * workspace-service and intelligence-service call in. Deliberately NOT delegated to gateway-service: Firebase
 * verification, CSRF and rate limiting are too entangled to split off safely, so each service keeps its own
 * copy of this chain (the other two resolve the signed-in user over Feign instead of a local table, and don't
 * serve the public auth/plan/webhook routes). A change to session or rate-limit behaviour has to be made in
 * all three; see docs/architecture/.
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
                        // Stripe can't hold a CSRF token; its webhook is authenticated by signature instead.
                        // /internal/** can't either - it's a machine-to-machine call authenticated by the
                        // shared internal-service secret, structurally unable to carry a browser's CSRF header.
                        .ignoringRequestMatchers("/webhooks/**", "/internal/**"))
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
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/session", "/api/auth/logout").permitAll()
                        .requestMatchers("/webhooks/**").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/plans").permitAll()
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

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
