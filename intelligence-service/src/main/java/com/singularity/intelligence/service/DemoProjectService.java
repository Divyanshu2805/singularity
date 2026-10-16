package com.singularity.intelligence.service;

/**
 * The shared demo account's sample project, as far as intelligence-service is concerned: its first build.
 *
 * <p>Handles: recording, on a project workspace-service has just made from the starter template, the first build the
 * README's screenshots show - the idea's brief as the person's message, and the notes app written in reply - so a
 * visitor opens a project that has been built, with its chat, files and preview, without any model being asked.
 *
 * <p>Called only by account-service, through the internal API, from the daily reset of the demo account.
 */
public interface DemoProjectService {

    void recordFirstBuild(Long projectId, Long userId);
}
