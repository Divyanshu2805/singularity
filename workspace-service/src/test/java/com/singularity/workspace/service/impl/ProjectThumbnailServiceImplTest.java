package com.singularity.workspace.service.impl;

import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.service.ProjectThumbnailService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers {@link ProjectThumbnailServiceImpl}: which bytes are kept as a project's picture, and what is served.
 *
 * <p>Handles: a WebP and a JPEG are stored under the type their own bytes give and the time is recorded; an SVG, an
 * HTML page, an empty body and an oversized one are refused before storage is touched; the limit per hour holds for
 * one project without holding another back; a project with no picture, or whose stored bytes are not an image, has
 * none to serve; and a served picture carries the type read from its bytes.
 */
class ProjectThumbnailServiceImplTest {

    private static final long PROJECT_ID = 12L;
    private static final Instant NOW = Instant.parse("2026-10-10T14:00:00Z");

    private final ThumbnailStore store = mock(ThumbnailStore.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final ProjectThumbnailServiceImpl service =
            new ProjectThumbnailServiceImpl(store, projectRepository, Clock.fixed(NOW, ZoneOffset.UTC));

    private static byte[] webp() {
        byte[] bytes = new byte[64];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, bytes, 0, 4);
        System.arraycopy("WEBP".getBytes(StandardCharsets.US_ASCII), 0, bytes, 8, 4);
        return bytes;
    }

    private static byte[] jpeg() {
        byte[] bytes = new byte[64];
        bytes[0] = (byte) 0xFF;
        bytes[1] = (byte) 0xD8;
        bytes[2] = (byte) 0xFF;
        return bytes;
    }

    @Test
    @DisplayName("a WebP and a JPEG are stored under the type their bytes give, and the time is recorded")
    void anImageIsStoredAndTheTimeRecorded() {
        when(projectRepository.markThumbnail(PROJECT_ID, NOW)).thenReturn(1);

        service.save(PROJECT_ID, webp());
        service.save(PROJECT_ID, jpeg());

        verify(store).put(PROJECT_ID, webp(), "image/webp");
        verify(store).put(PROJECT_ID, jpeg(), "image/jpeg");
        verify(projectRepository, org.mockito.Mockito.times(2)).markThumbnail(PROJECT_ID, NOW);
    }

    @Test
    @DisplayName("an SVG, an HTML page, an empty body and an oversized picture are refused before storage is touched")
    void whatIsNotASmallImageIsRefused() {
        byte[] tooLarge = new byte[ProjectThumbnailServiceImpl.MAX_BYTES + 1];
        System.arraycopy(jpeg(), 0, tooLarge, 0, 3);

        for (byte[] refused : new byte[][]{
                "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes(StandardCharsets.UTF_8),
                "<!doctype html><script>alert(1)</script>".getBytes(StandardCharsets.UTF_8),
                new byte[0],
                tooLarge}) {
            assertThatThrownBy(() -> service.save(PROJECT_ID, refused)).isInstanceOf(BadRequestException.class);
        }
        assertThatThrownBy(() -> service.save(PROJECT_ID, null)).isInstanceOf(BadRequestException.class);
        verify(store, never()).put(anyLong(), any(), anyString());
        verify(projectRepository, never()).markThumbnail(anyLong(), any());
    }

    @Test
    @DisplayName("a project's pictures are limited per hour, and one project's limit does not hold another back")
    void theLimitIsPerProject() {
        when(projectRepository.markThumbnail(anyLong(), any())).thenReturn(1);
        for (int i = 0; i < ProjectThumbnailServiceImpl.MAX_PER_HOUR; i++) {
            service.save(PROJECT_ID, webp());
        }

        assertThatThrownBy(() -> service.save(PROJECT_ID, webp())).isInstanceOf(RateLimitExceededException.class);
        service.save(PROJECT_ID + 1, webp());
        verify(store).put(PROJECT_ID + 1, webp(), "image/webp");
    }

    @Test
    @DisplayName("a picture for a project that has gone is said to be not found")
    void aGoneProjectIsNotFound() {
        when(projectRepository.markThumbnail(PROJECT_ID, NOW)).thenReturn(0);

        assertThatThrownBy(() -> service.save(PROJECT_ID, webp())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("a served picture carries the type read from its bytes")
    void aPictureIsServedWithItsOwnType() {
        when(projectRepository.findThumbnailAt(PROJECT_ID)).thenReturn(Optional.of(NOW));
        when(store.read(PROJECT_ID)).thenReturn(Optional.of(jpeg()));

        ProjectThumbnailService.Thumbnail served = service.read(PROJECT_ID);

        assertThat(served.contentType()).isEqualTo("image/jpeg");
        assertThat(served.bytes()).isEqualTo(jpeg());
    }

    @Test
    @DisplayName("a project with no picture, a lost object and stored bytes that are not an image all have none to serve")
    void noPictureIsNotFound() {
        when(projectRepository.findThumbnailAt(PROJECT_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.read(PROJECT_ID)).isInstanceOf(ResourceNotFoundException.class);
        verify(store, never()).read(anyLong());

        when(projectRepository.findThumbnailAt(PROJECT_ID)).thenReturn(Optional.of(NOW));
        when(store.read(PROJECT_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.read(PROJECT_ID)).isInstanceOf(ResourceNotFoundException.class);

        when(store.read(PROJECT_ID)).thenReturn(Optional.of("<svg/>".getBytes(StandardCharsets.UTF_8)));
        assertThatThrownBy(() -> service.read(PROJECT_ID)).isInstanceOf(ResourceNotFoundException.class);
    }
}
