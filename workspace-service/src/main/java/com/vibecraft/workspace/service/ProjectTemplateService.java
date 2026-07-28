package com.vibecraft.workspace.service;

/**
 * Puts the starter template's files into a new project.
 *
 * <p>Handles: copying them, retrying automatically when some fail, and reporting what is still missing rather than
 * throwing on a partial failure.
 *
 * <p>Idempotent: files the project already has are skipped, so this is safe to call again later to finish an
 * incomplete initialisation.
 */
public interface ProjectTemplateService {

    TemplateInitResult initializeProjectFromTemplate(Long projectId);
}
