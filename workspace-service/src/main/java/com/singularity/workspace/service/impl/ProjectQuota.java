package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.repository.ProjectMemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * The plan's allowance of projects, checked before anything is created.
 *
 * <p>Handles: refusing a new project - made from scratch, from a prompt, or as a fork - once the caller owns as many as
 * their plan includes, with a 402 rather than a 400 because nothing is wrong with the request.
 *
 * <p>Must be called inside a transaction: it takes a Postgres advisory lock that serializes the same person's
 * concurrent creates, held until the surrounding transaction ends, so two requests that both read "under the limit"
 * cannot both be admitted before either has committed. The allowance comes from account-service; the count owned is
 * local, since memberships are this service's own table.
 */
@Component
@RequiredArgsConstructor
public class ProjectQuota {

    private final AuthUtil authUtil;
    private final AccountServiceClient accountServiceClient;
    private final ProjectMemberRepository projectMemberRepository;

    public void assertCanCreateProject() {
        Long userId = authUtil.getCurrentUserId();
        PlanDto plan = accountServiceClient.getPlanLimits(userId);
        int allowance = plan.maxProjects();

        projectMemberRepository.lockProjectQuota(userId);
        int owned = projectMemberRepository.countProjectOwnedByUser(userId);

        if (owned < allowance) {
            return;
        }

        String planName = plan.name();
        throw new QuotaExceededException(
                "The " + planName + " plan includes " + allowance + (allowance == 1 ? " project" : " projects")
                        + ". Upgrade, or delete one to make room.",
                QuotaExceededException.Reason.PROJECT_LIMIT,
                allowance, owned, null, planName);
    }
}
