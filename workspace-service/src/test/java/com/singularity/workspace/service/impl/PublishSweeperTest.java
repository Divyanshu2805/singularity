package com.singularity.workspace.service.impl;

import com.singularity.common.error.FileStorageException;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.PublishedAppRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What the sweeper cleans up: a build whose service died, and the builds and pointers an update or a take-down left to
 * be deleted. The cases that matter are the ones where a mistake would take down something live - a pointer removed from
 * an app that has since been published again - or leave an abandoned build saying "Publishing" forever.
 */
class PublishSweeperTest {

    private final PublishedAppRepository appRepository = mock(PublishedAppRepository.class);
    private final PublishedStore store = mock(PublishedStore.class);
    private final PublishSweeper sweeper = new PublishSweeper(appRepository, store, PublishingTestProperties.defaults());

    private static PublishedApp app(PublishStatus status, PublishBuildStatus build, String retired) {
        return PublishedApp.builder().id(11L).slug("my-app-ab12").status(status).buildStatus(build).buildNumber(4)
                .retiredPrefix(retired).retiredAt(Instant.now().minusSeconds(600)).buildHeartbeatAt(Instant.now().minusSeconds(300)).build();
    }

    @Test
    @DisplayName("a build whose heartbeat stopped is failed as the platform's, so the panel stops saying Publishing")
    void failsAnAbandonedBuild() {
        when(appRepository.findBuildsWithoutHeartbeatSince(any())).thenReturn(List.of(app(PublishStatus.LIVE, PublishBuildStatus.BUILDING, null)));
        when(appRepository.markFailed(eq(11L), eq(4L), eq(PublishFailureKind.PLATFORM), eq(PublishSweeper.ABANDONED), isNull())).thenReturn(1);

        sweeper.sweep();

        verify(appRepository).markFailed(11L, 4L, PublishFailureKind.PLATFORM, PublishSweeper.ABANDONED, null);
    }

    @Test
    @DisplayName("the heartbeat cutoff is the configured staleness, not now")
    void usesTheConfiguredStaleness() {
        Instant before = Instant.now();

        sweeper.sweep();

        var cutoff = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(appRepository).findBuildsWithoutHeartbeatSince(cutoff.capture());
        org.assertj.core.api.Assertions.assertThat(cutoff.getValue())
                .isBetween(before.minusSeconds(46), Instant.now().minusSeconds(44));
    }

    @Test
    @DisplayName("every build that is neither live nor being made is deleted, and the retirement cleared once they have gone")
    void deletesWhatIsNeitherLiveNorBeingMade() {
        PublishedApp live = app(PublishStatus.LIVE, null, "b3/");
        live.setLivePrefix("b4/");
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(live));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b2/", "b3/", "b4/"));

        sweeper.sweep();

        verify(store).deleteBuild("my-app-ab12", "b2/");
        verify(store).deleteBuild("my-app-ab12", "b3/");
        verify(store, never()).deleteBuild("my-app-ab12", "b4/");
        verify(appRepository).clearRetired(11L, "b3/");
        verify(store, never()).deletePointer(anyString());
    }

    @Test
    @DisplayName("the build being made is never deleted from under itself")
    void keepsTheBuildInProgress() {
        PublishedApp building = app(PublishStatus.LIVE, PublishBuildStatus.BUILDING, "b1/");
        building.setLivePrefix("b3/");
        building.setBuildNumber(4);
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(building));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b1/", "b3/", "b4/"));

        sweeper.sweep();

        verify(store).deleteBuild("my-app-ab12", "b1/");
        verify(store, never()).deleteBuild("my-app-ab12", "b3/");
        verify(store, never()).deleteBuild("my-app-ab12", "b4/");
    }

    @Test
    @DisplayName("an app unpublished straight after an update loses both builds, not only the one its row remembers")
    void unpublishAfterAnUpdateLeavesNothing() {
        PublishedApp unpublished = app(PublishStatus.UNPUBLISHED, null, "b1/");
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(unpublished));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b1/", "b2/"));

        sweeper.sweep();

        verify(store).deleteBuild("my-app-ab12", "b1/");
        verify(store).deleteBuild("my-app-ab12", "b2/");
        verify(store).deletePointer("my-app-ab12");
    }

    @Test
    @DisplayName("for an unpublished app the pointer is removed again, so a take-down that failed once finishes")
    void finishesATakeDown() {
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(app(PublishStatus.UNPUBLISHED, null, "b3/")));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b3/"));

        sweeper.sweep();

        verify(store).deleteBuild("my-app-ab12", "b3/");
        verify(store).deletePointer("my-app-ab12");
        verify(appRepository).clearRetired(11L, "b3/");
    }

    @Test
    @DisplayName("an unpublished app that is being built again keeps whatever pointer its new build has written")
    void leavesTheNewBuildsPointer() {
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(app(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING, "b3/")));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b3/"));

        sweeper.sweep();

        verify(store).deleteBuild("my-app-ab12", "b3/");
        verify(store, never()).deletePointer(anyString());
    }

    @Test
    @DisplayName("a delete that fails is left on the row to try again, and does not stop the rest of the pass")
    void aFailedDeleteIsRetried() {
        PublishedApp stuck = app(PublishStatus.LIVE, null, "b3/");
        PublishedApp other = PublishedApp.builder().id(12L).slug("other-app-cd34").status(PublishStatus.LIVE)
                .retiredPrefix("b1/").retiredAt(Instant.now().minusSeconds(600)).build();
        when(appRepository.findRetiredBefore(any())).thenReturn(List.of(stuck, other));
        when(store.listBuildPrefixes("my-app-ab12")).thenReturn(List.of("b3/"));
        when(store.listBuildPrefixes("other-app-cd34")).thenReturn(List.of("b1/"));
        doThrow(new FileStorageException("down", null)).when(store).deleteBuild("my-app-ab12", "b3/");

        sweeper.sweep();

        verify(appRepository, never()).clearRetired(eq(11L), anyString());
        verify(store).deleteBuild("other-app-cd34", "b1/");
        verify(appRepository).clearRetired(12L, "b1/");
    }

    @Test
    @DisplayName("a pass that cannot reach the database is skipped quietly, not thrown into the scheduler")
    void aBrokenPassIsSwallowed() {
        when(appRepository.findBuildsWithoutHeartbeatSince(any())).thenThrow(new IllegalStateException("db down"));

        sweeper.sweep();

        verify(appRepository, never()).markFailed(anyLong(), anyLong(), any(), anyString(), any());
    }
}
