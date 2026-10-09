package com.singularity.workspace.service;

import com.singularity.workspace.dto.project.ForkProjectRequest;
import com.singularity.workspace.dto.project.ProjectResponse;
import com.singularity.workspace.dto.publish.PublicAppResponse;
import com.singularity.workspace.dto.publish.PublicFileContent;
import com.singularity.workspace.dto.publish.PublicFileNode;

import java.util.List;

/**
 * The public, read-only page of a shared app: what it is, its code, and a fork of it.
 *
 * <p>Handles: describing a shared app by its link name, listing and reading the files of the build that is live, and
 * forking that build's sources into a new project the caller owns.
 *
 * <p>Everything but the fork is open to anyone with the link, so every method begins by asking whether the app is
 * shared at all - live, its project not deleted, its owner's switch on - and answers "not found" in the same words for
 * each way it can be no: the page must not tell a stranger which of those it was. What is read is the snapshot stored
 * with the live build, never the project's current files, so work in progress is never on show. The fork needs a
 * signed-in caller and counts against their project allowance.
 */
public interface PublicAppService {

    PublicAppResponse getApp(String slug);

    List<PublicFileNode> getFiles(String slug);

    PublicFileContent getFile(String slug, String path);

    ProjectResponse fork(String slug, ForkProjectRequest request);
}
