package com.vibecraft.common.security;

import jakarta.servlet.DispatcherType;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.servlet.HandlerExceptionResolver;

/**
 * The browser-facing security chain for a service that serves no public route - workspace-service and
 * intelligence-service, whose every /api/** endpoint requires a session.
 *
 * <p>Handles: CSRF for a cookie session, the security response headers, the filter order (session authentication,
 * then machine authentication, then rate limiting), the authority required on /internal/v1/**, and routing 401 and
 * 403 through HandlerExceptionResolver so they come back in the same ApiError shape as every other failure.
 *
 * <p>Two rules here are load-bearing. /internal/** requires InternalServiceAuthFilter.ROLE rather than merely an
 * authenticated caller, because those endpoints answer for an arbitrary user or project with no ownership check and a
 * session cookie - which SessionAuthFilter would happily authenticate - must not satisfy them. And the CSRF exemption
 * for /internal/** is structural, not a convenience: that caller is another service authenticated by a shared secret,
 * which cannot carry a browser's CSRF header.
 *
 * <p>account-service defines its own chain instead of using this one, since it serves the public sign-in, plan and
 * Stripe-webhook routes, so CommonLibAutoConfiguration only builds this chain when no other SecurityFilterChain bean
 * exists.
 */
public final class ServiceSecurityConfig {

    private ServiceSecurityConfig() {
    }

    static final String CONTENT_SECURITY_POLICY =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                    + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    public static SecurityFilterChain build(HttpSecurity httpSecurity,
                                            SessionAuthenticator sessionAuthenticator,
                                            SessionCookies sessionCookies,
                                            HandlerExceptionResolver handlerExceptionResolver,
                                            InternalServiceAuthFilter internalServiceAuthFilter) {
        SessionAuthFilter sessionAuthFilter = new SessionAuthFilter(
                sessionAuthenticator, sessionCookies, handlerExceptionResolver);
        RateLimitFilter rateLimitFilter = new RateLimitFilter(new RateLimiter(), handlerExceptionResolver);

        httpSecurity
                .csrf(csrf -> csrf
                        .spa()
                        .ignoringRequestMatchers("/internal/**"))
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
                        // DEP-036: actuator's own management.server.port already runs outside this chain
                        // entirely (a separate child context) - this rule is defense in depth for the day someone
                        // removes that port separation, not the thing actually keeping health checks reachable.
                        .requestMatchers("/actuator/health/**").permitAll()
                        .requestMatchers("/internal/**").hasAuthority(InternalServiceAuthFilter.ROLE)
                        .anyRequest().authenticated())
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
