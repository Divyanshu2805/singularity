package com.singularity.workspace.controller;

import com.singularity.workspace.service.ProjectThumbnailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * The picture a project's card shows, for the browser.
 *
 * <p>Handles: taking a new picture as the raw bytes of the request, and serving the stored one as an image the
 * browser may keep - its address carries the time it was taken, so a new picture has a new address.
 *
 * <p>The permission checks and every check of the bytes are the service's ({@code ProjectThumbnailServiceImpl}); the
 * request's own content type is not looked at. The response says the picture is private to the signed-in person, since
 * it shows a project only its members may open.
 */
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/projects/{projectId}/thumbnail")
public class ProjectThumbnailController {

    private final ProjectThumbnailService thumbnailService;

    @PutMapping
    public ResponseEntity<Void> save(@PathVariable Long projectId, @RequestBody byte[] bytes) {
        thumbnailService.save(projectId, bytes);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<byte[]> read(@PathVariable Long projectId) {
        ProjectThumbnailService.Thumbnail thumbnail = thumbnailService.read(projectId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(thumbnail.contentType()))
                .cacheControl(CacheControl.maxAge(Duration.ofDays(30)).cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .body(thumbnail.bytes());
    }
}
