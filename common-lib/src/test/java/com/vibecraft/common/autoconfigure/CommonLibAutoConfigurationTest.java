package com.vibecraft.common.autoconfigure;

import com.vibecraft.common.security.InternalServiceAuthFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins CODE_REVIEW.md SEC-02: InternalServiceAuthFilter must stay a Filter bean that Spring Boot's servlet
 * auto-registration never installs a second time outside the security chain.
 *
 * <p>Spring Boot registers every {@code Filter} bean as a plain servlet filter on every request in addition to
 * wherever a security chain adds it explicitly. Without the disabled {@link FilterRegistrationBean} here, the
 * internal-service authority would be evaluated (and, on a correct secret, granted) on requests the security chain
 * never routed it through - a bug that would be invisible in a controller test and only visible by inspecting the
 * registered servlet filter list at runtime. This test fixes that as an assertion instead of a comment.
 */
class CommonLibAutoConfigurationTest {

    private final CommonLibAutoConfiguration configuration = new CommonLibAutoConfiguration();

    @Test
    void internalServiceAuthFilterServletRegistrationStaysDisabled() {
        InternalServiceAuthFilter filter = configuration.internalServiceAuthFilter("shared-secret");

        FilterRegistrationBean<InternalServiceAuthFilter> registration =
                configuration.internalServiceAuthFilterRegistration(filter);

        assertThat(registration.isEnabled()).isFalse();
        assertThat(registration.getFilter()).isSameAs(filter);
    }
}
