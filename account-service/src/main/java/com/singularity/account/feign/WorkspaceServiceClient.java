package com.singularity.account.feign;

import com.singularity.common.dto.DeleteUserDataRequest;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.common.dto.ProjectTitleDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

/**
 * account-service's way to have workspace-service remove what it holds about an account being deleted, and make the
 * shared demo account's sample project.
 *
 * <p>Handles: making the demo account's sample project from the starter template (DemoAccountServiceImpl), and
 * deleting - delete or leave every project of the account, delete the invitations sent to its address
 * or by it, and forget its GitHub connection. It can take a while, since each owned project's preview is stopped and
 * its published app taken down, so this client is given a longer read timeout than the default (application.yaml).
 *
 * <p>The full /internal/v1 path is on the method, never in a @FeignClient path prefix: FeignClientInterceptor adds the
 * shared secret only to a path it can see begins /internal/.
 */
@FeignClient(name = "workspace-service")
public interface WorkspaceServiceClient {

    @PostMapping("/internal/v1/users/{userId}/delete-data")
    void deleteUserData(@PathVariable Long userId, @RequestBody DeleteUserDataRequest request);

    @PostMapping("/internal/v1/users/{userId}/demo-project")
    ProjectSummaryDto createDemoProject(@PathVariable Long userId, @RequestBody ProjectTitleDto request);
}
