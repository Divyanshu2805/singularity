package com.singularity.workspace.service;

import com.singularity.workspace.dto.publish.PublishLogResponse;
import com.singularity.workspace.dto.publish.PublishRequest;
import com.singularity.workspace.dto.publish.PublishResponse;

import java.util.Collection;
import java.util.Map;

/**
 * A project's published app: putting it online, updating it, taking it down, and saying where it stands.
 *
 * <p>Handles: reading the state of a project's publish, starting a build that will put the project's current revision
 * online at its link (the first time, or as an update), unpublishing, sharing or un-sharing the code, reading the
 * output of a failed build, taking an app down because its project was deleted, and the links of the live apps among a
 * set of projects, for the project cards.
 *
 * <p>Any member may read the state - looking at what exists is part of viewing a project - and only the owner may
 * change it. The guards sit here, where the caller is a user; {@link #takeDown} and {@link #liveUrls} are for the
 * service itself and carry none: the first is called by a deletion the owner was already authorised for, the second by
 * a listing that has already limited itself to projects the caller is in.
 */
public interface PublishService {

    PublishResponse getStatus(Long projectId);

    PublishResponse publish(Long projectId, PublishRequest request);

    void unpublish(Long projectId);

    PublishResponse setSharing(Long projectId, boolean shared);

    PublishLogResponse getBuildLog(Long projectId);

    void takeDown(Long projectId);

    Map<Long, String> liveUrls(Collection<Long> projectIds);
}
