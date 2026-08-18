package com.vibecraft.common.autoconfigure;

import com.google.firebase.auth.FirebaseAuth;
import com.vibecraft.common.config.AsyncConfig;
import com.vibecraft.common.config.ClockConfig;
import com.vibecraft.common.config.FeignResilienceConfig;
import com.vibecraft.common.config.FirebaseConfig;
import com.vibecraft.common.error.GlobalExceptionHandler;
import com.vibecraft.common.feign.AccountServiceClient;
import com.vibecraft.common.feign.FeignClientInterceptor;
import com.vibecraft.common.security.AuthProperties;
import com.vibecraft.common.security.AuthUtil;
import com.vibecraft.common.security.FirebaseIdentityVerifier;
import com.vibecraft.common.security.IdentityVerifier;
import com.vibecraft.common.security.InternalServiceAuthFilter;
import com.vibecraft.common.security.InternalSessionController;
import com.vibecraft.common.security.RemoteSessionAuthenticator;
import com.vibecraft.common.security.SessionAuthenticator;
import com.vibecraft.common.security.SessionCache;
import com.vibecraft.common.security.ServiceSecurityConfig;
import com.vibecraft.common.security.SessionCookies;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;

import org.springframework.web.servlet.HandlerExceptionResolver;

import java.time.Clock;

/**
 * Registers everything common-lib contributes to a consuming service, without that service widening its own component
 * scan.
 *
 * <p>Handles: the shared error handler, clock and async config; the Firebase app and the identity verifier built on
 * it; the whole session-authentication kit (properties, cookie reader/writer, cache, the /internal/v1/sessions/evict
 * endpoint and the caller-principal helper); the default browser-facing security chain; both halves of
 * service-to-service authentication, the outbound Feign interceptor and the inbound InternalServiceAuthFilter; and
 * the bounded Feign retry policy every outbound call gets (FeignResilienceConfig) - per-service connect/read
 * timeouts live in each service's own application.yaml (feign.client.config.default) instead, since that's plain
 * Spring Cloud OpenFeign configuration with nothing shared to centralize.
 * Resolved through Spring Boot's auto-configuration mechanism
 * (META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports), so these beans exist in every
 * service even though they live outside com.vibecraft.&lt;service&gt;.
 *
 * <p>Two things here are load-bearing and easy to undo by accident. internalServiceAuthFilterRegistration DISABLES
 * the servlet registration Spring Boot performs for every Filter bean: without it the filter would also run outside
 * the security chain, on every request, granting the internal-service authority where it was never wired in.
 * sessionAuthenticator and serviceSecurityFilterChain are both conditional on no such bean existing, because
 * account-service owns the User and REVOKED_SESSION tables and serves public routes, so it supplies its own of each.
 */
@AutoConfiguration
@EnableMethodSecurity
@Import({GlobalExceptionHandler.class, ClockConfig.class, AsyncConfig.class, FirebaseConfig.class, FeignResilienceConfig.class})
@EnableConfigurationProperties(AuthProperties.class)
public class CommonLibAutoConfiguration {

    @Bean
    public AuthUtil authUtil() {
        return new AuthUtil();
    }

    @Bean
    public SessionCookies sessionCookies(AuthProperties authProperties) {
        return new SessionCookies(authProperties);
    }

    @Bean
    public SessionCache sessionCache() {
        return new SessionCache();
    }

    @Bean
    public InternalSessionController internalSessionController(SessionCache sessionCache) {
        return new InternalSessionController(sessionCache);
    }

    @Bean
    public IdentityVerifier identityVerifier(FirebaseAuth firebaseAuth) {
        return new FirebaseIdentityVerifier(firebaseAuth);
    }

    @Bean
    @ConditionalOnMissingBean(SessionAuthenticator.class)
    public SessionAuthenticator sessionAuthenticator(IdentityVerifier identityVerifier, SessionCache sessionCache,
                                                     AccountServiceClient accountServiceClient,
                                                     AuthProperties authProperties, Clock clock) {
        return new RemoteSessionAuthenticator(identityVerifier, sessionCache, accountServiceClient, authProperties, clock);
    }

    @Bean
    @ConditionalOnMissingBean(SecurityFilterChain.class)
    public SecurityFilterChain serviceSecurityFilterChain(HttpSecurity httpSecurity,
                                                          SessionAuthenticator sessionAuthenticator,
                                                          SessionCookies sessionCookies,
                                                          HandlerExceptionResolver handlerExceptionResolver,
                                                          InternalServiceAuthFilter internalServiceAuthFilter) {
        return ServiceSecurityConfig.build(httpSecurity, sessionAuthenticator, sessionCookies,
                handlerExceptionResolver, internalServiceAuthFilter);
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

    @Bean
    public FilterRegistrationBean<InternalServiceAuthFilter> internalServiceAuthFilterRegistration(
            InternalServiceAuthFilter filter) {
        FilterRegistrationBean<InternalServiceAuthFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
