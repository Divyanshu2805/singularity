package com.singularity.common.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.cloud.openfeign.FeignClientFactory;
import org.springframework.cloud.openfeign.FeignClientSpecification;
import org.springframework.cloud.openfeign.support.FeignHttpMessageConverters;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the startup step that builds each Feign client's decoder before the first request.
 *
 * <p>The library builds that decoder's converter list lazily and without a lock, so two first requests at once could
 * see it empty and fail with a 500 - which is what happened to the first page load after every restart. This pins
 * that every declared client is prepared, that the shared default configuration is not mistaken for one, and that a
 * client which cannot be prepared does not stop the service from starting.
 */
class FeignConverterWarmupTest {

    @SuppressWarnings("unchecked")
    private final ObjectProvider<FeignClientFactory> provider = mock(ObjectProvider.class);
    private final FeignClientFactory factory = mock(FeignClientFactory.class);
    private final FeignConverterWarmup warmup = new FeignConverterWarmup(provider);

    private void clients(String... names) {
        Map<String, FeignClientSpecification> configurations = new LinkedHashMap<>();
        for (String name : names) {
            configurations.put(name, new FeignClientSpecification(name, name, new Class<?>[0]));
        }
        when(provider.getIfAvailable()).thenReturn(factory);
        when(factory.getConfigurations()).thenReturn(configurations);
    }

    @Test
    void everyDeclaredClientHasItsConvertersBuiltOnceAtStartup() {
        clients("account-service", "workspace-service");
        FeignHttpMessageConverters account = mock(FeignHttpMessageConverters.class);
        FeignHttpMessageConverters workspace = mock(FeignHttpMessageConverters.class);
        when(factory.getInstance("account-service", FeignHttpMessageConverters.class)).thenReturn(account);
        when(factory.getInstance("workspace-service", FeignHttpMessageConverters.class)).thenReturn(workspace);

        warmup.afterSingletonsInstantiated();

        verify(account).getConverters();
        verify(workspace).getConverters();
    }

    @Test
    void theSharedDefaultConfigurationIsNotTreatedAsAClient() {
        clients("default.com.singularity.intelligence.IntelligenceServiceApplication", "account-service");
        when(factory.getInstance("account-service", FeignHttpMessageConverters.class))
                .thenReturn(mock(FeignHttpMessageConverters.class));

        warmup.afterSingletonsInstantiated();

        verify(factory, never()).getInstance(
                eq("default.com.singularity.intelligence.IntelligenceServiceApplication"), any(Class.class));
    }

    @Test
    void aClientThatCannotBePreparedDoesNotStopTheOthersOrTheStartup() {
        clients("account-service", "workspace-service");
        FeignHttpMessageConverters workspace = mock(FeignHttpMessageConverters.class);
        when(factory.getInstance("account-service", FeignHttpMessageConverters.class))
                .thenThrow(new IllegalStateException("context could not be built"));
        when(factory.getInstance("workspace-service", FeignHttpMessageConverters.class)).thenReturn(workspace);

        assertThatCode(warmup::afterSingletonsInstantiated).doesNotThrowAnyException();

        verify(workspace).getConverters();
    }

    @Test
    void aServiceWithNoFeignFactoryDoesNothing() {
        when(provider.getIfAvailable()).thenReturn(null);

        assertThatCode(warmup::afterSingletonsInstantiated).doesNotThrowAnyException();
    }
}
