package com.singularity.intelligence.service.impl;

import com.singularity.common.dto.CodeCheckRequest;
import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.service.CodeChecker;
import feign.Request;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;

/**
 * Has workspace-service type-check a build turn's files in the project's running preview.
 *
 * <p>Handles: sending the files over the internal API with a time limit of its own, and turning every way that can
 * fail - workspace-service down, the call running long, an answer that makes no sense - into "not checked".
 *
 * <p>The limit is longer than any other call to workspace-service gets, because this one waits on a compiler in a
 * small pod; workspace-service bounds the check itself well inside it, so in practice the call returns "not checked"
 * before this limit is reached and the retry a timed-out call would get never happens.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PreviewCodeChecker implements CodeChecker {

    private static final Request.Options PATIENT = new Request.Options(2, TimeUnit.SECONDS, 60, TimeUnit.SECONDS, true);

    private final WorkspaceServiceClient workspaceServiceClient;

    @Override
    public CodeCheckResponse check(Long projectId, Map<String, String> written, Set<String> deleted) {
        try {
            CodeCheckResponse response = workspaceServiceClient.checkCode(projectId,
                    new CodeCheckRequest(written, List.copyOf(deleted)), PATIENT);
            if (response == null) {
                return CodeCheckResponse.skipped("The check returned nothing.");
            }
            return response.problems() == null
                    ? new CodeCheckResponse(response.checked(), response.skippedBecause(), List.of())
                    : response;
        } catch (RuntimeException e) {
            log.warn("Couldn't have the files written for projectId: {} type-checked - saving them on the static checks alone",
                    projectId, e);
            return CodeCheckResponse.skipped("The check could not be reached.");
        }
    }
}
