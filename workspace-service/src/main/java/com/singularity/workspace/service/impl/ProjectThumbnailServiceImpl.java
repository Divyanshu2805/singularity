package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.security.RateLimiter;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectThumbnailService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;

/**
 * Stores and serves the picture a project's card shows.
 *
 * <p>Handles: taking a picture a member's browser sends, checking it is a small WebP or JPEG by its own first bytes,
 * keeping it as the project's one picture and recording when; and handing the picture back with the type its bytes
 * say it is.
 *
 * <p>Where the picture comes from. The cluster has no browser, and the app's own page cannot see into the preview's
 * frame, so the previewed page draws itself and posts the result to the workspace, which sends it here. That makes
 * the bytes exactly as trustworthy as the page: code an AI wrote, or a member edited, chose them. So nothing about
 * them is believed. The declared content type is ignored and the type is read from the bytes; anything that is not a
 * WebP or a JPEG is refused, which keeps out SVG and HTML, the two that could carry script; the size is capped far
 * below anything a browser would hesitate over; and the picture is only ever served as an image, to be shown in an
 * img element, where it cannot run. What a member can do with this is put a misleading picture on a project they can
 * already edit, which they could as easily do by editing the app.
 *
 * <p>Who may do what. Sending a picture needs the edit permission - a viewer's browser never sends one - and seeing
 * it needs only view. The guards are here because every caller of these methods is a user; nothing internal calls
 * them. The parameter is named projectId in both, as the expressions say.
 *
 * <p>A project's pictures are limited per hour, held in this process like the service's other limits: a page stuck
 * in a reload loop would otherwise write to storage on every turn of it. Recording the time is a query that leaves
 * the project's updated-at alone, so a new picture does not move the project up its owner's list.
 */
@Service
@Slf4j
public class ProjectThumbnailServiceImpl implements ProjectThumbnailService {

    static final int MAX_BYTES = 300_000;
    static final int MAX_PER_HOUR = 40;
    static final String WEBP = "image/webp";
    static final String JPEG = "image/jpeg";

    private final ThumbnailStore store;
    private final ProjectRepository projectRepository;
    private final Clock clock;
    private final RateLimiter rateLimiter = new RateLimiter();

    @Autowired
    public ProjectThumbnailServiceImpl(ThumbnailStore store, ProjectRepository projectRepository) {
        this(store, projectRepository, Clock.systemUTC());
    }

    ProjectThumbnailServiceImpl(ThumbnailStore store, ProjectRepository projectRepository, Clock clock) {
        this.store = store;
        this.projectRepository = projectRepository;
        this.clock = clock;
    }

    @Override
    @PreAuthorize("@security.canEditProject(#projectId)")
    public void save(Long projectId, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new BadRequestException("The picture is empty.");
        }
        if (bytes.length > MAX_BYTES) {
            throw new BadRequestException("A project's picture can be at most " + MAX_BYTES / 1000 + " KB.");
        }
        String contentType = typeOf(bytes);
        if (contentType == null) {
            throw new BadRequestException("A project's picture must be a WebP or JPEG image.");
        }
        long wait = rateLimiter.tryAcquire(
                new RateLimiter.Rule("project-thumbnail", MAX_PER_HOUR, Duration.ofHours(1)), String.valueOf(projectId));
        if (wait > 0) {
            throw new RateLimitExceededException(wait);
        }
        store.put(projectId, bytes, contentType);
        if (projectRepository.markThumbnail(projectId, clock.instant()) == 0) {
            throw new ResourceNotFoundException("Project", String.valueOf(projectId));
        }
        log.debug("Stored a {} byte {} picture for projectId: {}", bytes.length, contentType, projectId);
    }

    @Override
    @PreAuthorize("@security.canViewProject(#projectId)")
    public Thumbnail read(Long projectId) {
        if (projectRepository.findThumbnailAt(projectId).isEmpty()) {
            throw new ResourceNotFoundException("Picture of project", String.valueOf(projectId));
        }
        byte[] bytes = store.read(projectId)
                .orElseThrow(() -> new ResourceNotFoundException("Picture of project", String.valueOf(projectId)));
        String contentType = typeOf(bytes);
        if (contentType == null) {
            throw new ResourceNotFoundException("Picture of project", String.valueOf(projectId));
        }
        return new Thumbnail(bytes, contentType);
    }

    static String typeOf(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xFF && (bytes[1] & 0xFF) == 0xD8 && (bytes[2] & 0xFF) == 0xFF) {
            return JPEG;
        }
        if (bytes.length >= 12
                && bytes[0] == 'R' && bytes[1] == 'I' && bytes[2] == 'F' && bytes[3] == 'F'
                && bytes[8] == 'W' && bytes[9] == 'E' && bytes[10] == 'B' && bytes[11] == 'P') {
            return WEBP;
        }
        return null;
    }
}
