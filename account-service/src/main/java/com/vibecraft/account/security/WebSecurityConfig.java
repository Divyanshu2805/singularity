package com.vibecraft.account.security;

import com.vibecraft.common.security.InternalServiceAuthFilter;
import com.vibecraft.common.security.RateLimitFilter;
import com.vibecraft.common.security.RateLimiter;
import com.vibecraft.common.security.SessionAuthFilter;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCookies;
import jakarta.servlet.DispatcherType;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * account-service's browser-facing security chain.
 *
 * <p>Handles: CSRF for a cookie session, the security response headers, the filter order (session authentication,
 * then machine authentication, then rate limiting), which routes are public - the CSRF token, sign-in, sign-out, the
 * Stripe webhook and the plan catalogue - and the authority required on /internal/v1/**. Errors are routed through
 * HandlerExceptionResolver so a 401 or 403 comes back in the same ApiError shape as every other failure.
 *
 * <p>Two rules here are load-bearing. /internal/** requires the internal-service authority rather than merely an
 * authenticated caller, because those endpoints answer for an arbitrary user with no ownership check and a signed-in
 * user's session cookie - which the session filter would happily authenticate - must not satisfy them. And the CSRF
 * exemptions are structural, not conveniences: Stripe's webhook is authenticated by signature and /internal/** by the
 * shared secret, and neither caller can carry a browser's CSRF header.
 *
 * <p>account-service defines its own chain rather than using common-lib's because it is the only service with public
 * routes.
 */
@Configuration
@RequiredArgsConstructor
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
                        .ignoringRequestMatchers("/webhooks/**", "/internal/**"))
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
                        .requestMatchers("/internal/**").hasAuthority(InternalServiceAuthFilter.ROLE)
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
}
