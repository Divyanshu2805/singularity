package com.java.vibecraft.security;

import jakarta.servlet.DispatcherType;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Configuration
@RequiredArgsConstructor
@EnableMethodSecurity
@EnableConfigurationProperties(AuthProperties.class)
public class WebSecurityConfig {

    /**
     * This server only ever answers with JSON and SSE, so its responses need no scripts, styles or frames at all.
     * Swagger UI is the one HTML page it serves, and it needs its own scripts and inline styles.
     */
    static final String CONTENT_SECURITY_POLICY =
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
                    + "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

    private final SessionAuthenticator sessionAuthenticator;
    private final SessionCookies sessionCookies;
    private final AuthUtil authUtil;
    private final AuthProperties authProperties;
    private final HandlerExceptionResolver handlerExceptionResolver;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity httpSecurity) {
        SessionAuthFilter sessionAuthFilter = new SessionAuthFilter(
                sessionAuthenticator, sessionCookies, authUtil, authProperties, handlerExceptionResolver);
        RateLimitFilter rateLimitFilter = new RateLimitFilter(new RateLimiter(), handlerExceptionResolver);

        httpSecurity
                // Sessions ride in a cookie, which the browser attaches to any request - so every state-changing call
                // must also prove it came from this app's own pages. spa() is Spring's double-submit setup for SPAs:
                // a readable XSRF-TOKEN cookie the client echoes back in an X-XSRF-TOKEN header.
                .csrf(csrf -> csrf
                        .spa()
                        // Stripe can't hold a CSRF token; its webhook is authenticated by signature instead.
                        .ignoringRequestMatchers("/webhooks/**")
                        // A request carrying its own Bearer token (legacy path) can't be forged cross-site: a browser
                        // never attaches that header on its own.
                        .ignoringRequestMatchers(request -> {
                            String header = request.getHeader("Authorization");
                            return header != null && header.startsWith("Bearer ") && sessionCookies.read(request).isEmpty();
                        }))
                .cors(Customizer.withDefaults())
                .sessionManagement(sessionConfig -> sessionConfig.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives(CONTENT_SECURITY_POLICY))
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                        // Only ever sent over https, so it is inert in local http development.
                        .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000))
                        .addHeaderWriter((request, response) -> response.setHeader("Permissions-Policy",
                                "camera=(), microphone=(), geolocation=(), payment=(), usb=()"))
                        .addHeaderWriter((request, response) -> response.setHeader("Cross-Origin-Opener-Policy", "same-origin")))
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        // Only what someone signed out can legitimately call. /api/auth/me, /logout-all and
                        // /security-events are deliberately NOT here.
                        .requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/session", "/api/auth/logout").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/signup", "/api/auth/login",
                                "/api/auth/forgot-password", "/api/auth/reset-password").permitAll()
                        .requestMatchers("/webhooks/**").permitAll()
                        // `/api/plans` is public so a signed-out visitor can read the pricing page; it is
                        // catalogue data with no user context in it.
                        .requestMatchers(HttpMethod.GET, "/api/plans").permitAll()
                        .anyRequest().authenticated()
                )
                .addFilterBefore(sessionAuthFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterAfter(rateLimitFilter, SessionAuthFilter.class)
                .exceptionHandling(exceptionHandlingConfigurer -> exceptionHandlingConfigurer
                        // No credentials at all: 401 (the client signs out), not Spring's default 403.
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

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration authenticationConfiguration) {
        return authenticationConfiguration.getAuthenticationManager();
    }
}
