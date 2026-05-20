package com.java.vibecraft.service;

public interface ProjectTemplateService {

    /**
     * Copies the starter template's files into the project, retrying automatically if some
     * files fail. Idempotent: files the project already has are skipped, so this is safe to
     * call again later to finish an incomplete initialization. Never throws for a partial
     * failure - the result reports what's still missing so the caller can decide what to do.
     */
    TemplateInitResult initializeProjectFromTemplate(Long projectId);
}
