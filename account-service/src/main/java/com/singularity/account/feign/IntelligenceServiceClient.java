package com.singularity.account.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;

/**
 * account-service's way to have intelligence-service remove what it holds about an account being deleted.
 *
 * <p>Handles: the one call - delete every chat, note, tour, glossary word and usage record of the account.
 *
 * <p>The full /internal/v1 path is on the method, never in a @FeignClient path prefix: FeignClientInterceptor adds the
 * shared secret only to a path it can see begins /internal/.
 */
@FeignClient(name = "intelligence-service")
public interface IntelligenceServiceClient {

    @PostMapping("/internal/v1/users/{userId}/delete-data")
    void deleteUserData(@PathVariable Long userId);
}
