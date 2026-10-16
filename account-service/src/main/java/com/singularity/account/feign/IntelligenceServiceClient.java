package com.singularity.account.feign;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * account-service's way to have intelligence-service remove what it holds about an account being deleted, and record
 * the first build of the shared demo account's sample project.
 *
 * <p>Handles: deleting every chat, note, tour, glossary word and usage record of the account, and recording the demo
 * sample project's first build (DemoAccountServiceImpl).
 *
 * <p>The full /internal/v1 path is on the method, never in a @FeignClient path prefix: FeignClientInterceptor adds the
 * shared secret only to a path it can see begins /internal/.
 */
@FeignClient(name = "intelligence-service")
public interface IntelligenceServiceClient {

    @PostMapping("/internal/v1/users/{userId}/delete-data")
    void deleteUserData(@PathVariable Long userId);

    @PostMapping("/internal/v1/projects/{projectId}/demo-build")
    void recordDemoBuild(@PathVariable Long projectId, @RequestParam Long userId);
}
