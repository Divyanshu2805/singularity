package com.singularity.workspace.service;

/**
 * A project's picture: the small image of the app its card shows.
 *
 * <p>Handles: storing a new picture for a project, and reading the one it has.
 */
public interface ProjectThumbnailService {

    record Thumbnail(byte[] bytes, String contentType) {
    }

    void save(Long projectId, byte[] bytes);

    Thumbnail read(Long projectId);
}
