package com.singularity.workspace.service.impl;

import com.singularity.common.dto.PlanDto;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ConflictException;
import com.singularity.common.error.FileStorageException;
import com.singularity.common.error.QuotaExceededException;
import com.singularity.common.error.RateLimitExceededException;
import com.singularity.common.error.ResourceNotFoundException;
import com.singularity.common.feign.AccountServiceClient;
import com.singularity.common.security.AuthUtil;
import com.singularity.workspace.config.InstanceId;
import com.singularity.workspace.dto.publish.PublishRequest;
import com.singularity.workspace.dto.publish.PublishResponse;
import com.singularity.workspace.entity.Project;
import com.singularity.workspace.entity.PublishedApp;
import com.singularity.workspace.enums.PublishBuildStatus;
import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.enums.PublishStatus;
import com.singularity.workspace.repository.ProjectRepository;
import com.singularity.workspace.repository.PublishedAppRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.mockito.Mockito;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * What pressing Publish does, short of the build itself: who counts, what is refused and why, and what is written.
 *
 * <p>The cases are the ones that decide whether the feature is safe to leave on a public link - the plan allowance
 * (and that an update to an app already live does not spend it), one build at a time, the spacing between builds, the
 * hourly cap, a link name that is chosen once and kept, and a take-down that removes what the proxy serves from before
 * it changes the record. The caller's role is {@code PublishAuthorizationTest}'s; here the service is called directly.
 */
class PublishServiceImplTest {

    private static final long USER_ID = 7L;
    private static final long PROJECT_ID = 5L;
    private static final long APP_ID = 11L;

    private final PublishedAppRepository appRepository = mock(PublishedAppRepository.class);
    private final ProjectRepository projectRepository = mock(ProjectRepository.class);
    private final PublishedStore store = mock(PublishedStore.class);
    private final PublishBuilder builder = mock(PublishBuilder.class);
    private final AuthUtil authUtil = mock(AuthUtil.class);
    private final AccountServiceClient accountServiceClient = mock(AccountServiceClient.class);
    private final InstanceId instanceId = mock(InstanceId.class);

    private PublishServiceImpl service = serviceWith(10, 1);

    private PublishServiceImpl serviceWith(int maxBuildsPerHour, int defaultLimit) {
        return new PublishServiceImpl(appRepository, projectRepository, store, builder,
                PublishingTestProperties.with(maxBuildsPerHour, defaultLimit), new PublishRateLimiter(), authUtil,
                accountServiceClient, instanceId);
    }

    private Project project;

    @BeforeEach
    void signedInOwner() {
        project = Project.builder().id(PROJECT_ID).name("My Todo App").isPublic(false).currentFileRevisionId(3L).build();
        when(authUtil.getCurrentUserId()).thenReturn(USER_ID);
        when(projectRepository.findById(PROJECT_ID)).thenReturn(Optional.of(project));
        when(instanceId.value()).thenReturn("inst-1");
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Pro", 3, 100_000, 3, false));
        when(appRepository.countLiveOwnedBy(USER_ID)).thenReturn(0);
        when(appRepository.save(any(PublishedApp.class))).thenAnswer(call -> {
            PublishedApp row = call.getArgument(0);
            row.setId(APP_ID);
            return row;
        });
    }

    private PublishedApp row(PublishStatus status, PublishBuildStatus build) {
        return PublishedApp.builder().id(APP_ID).projectId(PROJECT_ID).slug("my-todo-app-ab12").status(status)
                .buildStatus(build).buildNumber(1).liveRevisionId(3L).livePrefix(status == PublishStatus.LIVE ? "b1/" : null)
                .publishedAt(status == PublishStatus.LIVE ? Instant.now() : null).build();
    }

    private void claimWillSucceed(PublishedApp started) {
        when(appRepository.claimBuild(eq(APP_ID), eq(USER_ID), anyString(), anyString(), any(), any())).thenReturn(1);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(started));
    }

    @Test
    @DisplayName("the first publish makes a row with a link name from the title, claims a build and starts it")
    void firstPublish() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        PublishedApp started = row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING);
        claimWillSucceed(started);

        PublishResponse response = service.publish(PROJECT_ID, null);

        var saved = org.mockito.ArgumentCaptor.forClass(PublishedApp.class);
        verify(appRepository).save(saved.capture());
        assertThat(saved.getValue().getSlug()).matches("my-todo-app-[a-z2-9]{4}");
        assertThat(saved.getValue().getStatus()).isEqualTo(PublishStatus.UNPUBLISHED);
        verify(builder).run(APP_ID, "my-todo-app-ab12", 1L, PROJECT_ID);
        assertThat(response.build().status()).isEqualTo(PublishBuildStatus.BUILDING);
        assertThat(response.live()).isFalse();
    }

    @Test
    @DisplayName("a chosen link name is validated and used")
    void chosenSlugIsUsed() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        claimWillSucceed(row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING));

        service.publish(PROJECT_ID, new PublishRequest("  My-Cool-App "));

        var saved = org.mockito.ArgumentCaptor.forClass(PublishedApp.class);
        verify(appRepository).save(saved.capture());
        assertThat(saved.getValue().getSlug()).isEqualTo("my-cool-app");
    }

    @Test
    @DisplayName("a reserved or malformed link name is refused before anything is written")
    void badSlugIsRefused() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("www"))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("p12-abcdefghij"))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("no spaces"))).isInstanceOf(BadRequestException.class);

        verify(appRepository, never()).save(any());
        verify(builder, never()).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("a link name someone else has is a conflict")
    void takenSlugIsAConflict() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        when(appRepository.existsBySlug("taken-name")).thenReturn(true);

        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("taken-name")))
                .isInstanceOf(ConflictException.class);

        verify(appRepository, never()).save(any());
    }

    @Test
    @DisplayName("a link name lost to a concurrent insert is a conflict too")
    void raceOnTheSlugIsAConflict() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        when(appRepository.save(any(PublishedApp.class))).thenThrow(new org.springframework.dao.DataIntegrityViolationException("dup"));

        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("my-cool-app")))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    @DisplayName("the link name is chosen once: asking for another one later is refused, not ignored")
    void theSlugIsKept() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));

        assertThatThrownBy(() -> service.publish(PROJECT_ID, new PublishRequest("another-name")))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("keeps the link name");

        verify(appRepository, never()).claimBuild(anyLong(), anyLong(), anyString(), anyString(), any(), any());
    }

    @Test
    @DisplayName("naming the same link again is fine - an update from a form that always sends it")
    void theSameSlugIsFine() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        claimWillSucceed(row(PublishStatus.LIVE, PublishBuildStatus.BUILDING));

        service.publish(PROJECT_ID, new PublishRequest("My-Todo-App-AB12"));

        verify(builder).run(eq(APP_ID), eq("my-todo-app-ab12"), eq(1L), eq(PROJECT_ID));
    }

    @Test
    @DisplayName("pressing Publish while a build is running answers with that build and starts no second one")
    void oneBuildAtATime() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING)));

        PublishResponse response = service.publish(PROJECT_ID, null);

        assertThat(response.build().status()).isEqualTo(PublishBuildStatus.BUILDING);
        verify(appRepository, never()).claimBuild(anyLong(), anyLong(), anyString(), anyString(), any(), any());
        verify(builder, never()).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("losing the claim to a build another press started answers with that build")
    void losingTheClaimToAConcurrentBuild() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));
        when(appRepository.claimBuild(eq(APP_ID), eq(USER_ID), anyString(), anyString(), any(), any())).thenReturn(0);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING)));

        PublishResponse response = service.publish(PROJECT_ID, null);

        assertThat(response.build().status()).isEqualTo(PublishBuildStatus.BUILDING);
        verify(builder, never()).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("a build started too soon after the last is refused with how long to wait")
    void tooSoonAfterTheLast() {
        PublishedApp recent = row(PublishStatus.LIVE, null);
        recent.setBuildStartedAt(Instant.now().minusSeconds(5));
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(recent));
        when(appRepository.claimBuild(eq(APP_ID), eq(USER_ID), anyString(), anyString(), any(), any())).thenReturn(0);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(recent));

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null))
                .isInstanceOfSatisfying(RateLimitExceededException.class,
                        e -> assertThat(e.getRetryAfterSeconds()).isBetween(1L, 30L));

        verify(builder, never()).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("the claim itself carries the spacing: it only applies to a build that started before the cutoff")
    void theClaimCarriesTheSpacing() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        claimWillSucceed(row(PublishStatus.LIVE, PublishBuildStatus.BUILDING));
        Instant before = Instant.now();

        service.publish(PROJECT_ID, null);

        var cutoff = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(appRepository).claimBuild(eq(APP_ID), eq(USER_ID), eq("inst-1"), eq(PublishBuilder.COLLECTING), any(), cutoff.capture());
        assertThat(cutoff.getValue()).isBetween(before.minusSeconds(31), Instant.now().minusSeconds(29));
    }

    @Test
    @DisplayName("a person may not start more builds in an hour than the cap, however many projects they own")
    void hourlyCap() {
        service = serviceWith(2, 1);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        claimWillSucceed(row(PublishStatus.LIVE, PublishBuildStatus.BUILDING));

        service.publish(PROJECT_ID, null);
        service.publish(PROJECT_ID, null);

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null)).isInstanceOf(RateLimitExceededException.class);
        verify(builder, Mockito.times(2)).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("a refused press is not counted against the hourly cap")
    void refusedPressesAreNotCounted() {
        service = serviceWith(1, 1);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        when(appRepository.claimBuild(eq(APP_ID), eq(USER_ID), anyString(), anyString(), any(), any())).thenReturn(0);
        PublishedApp recent = row(PublishStatus.LIVE, null);
        recent.setBuildStartedAt(Instant.now());
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(recent));

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null)).isInstanceOf(RateLimitExceededException.class);

        when(appRepository.claimBuild(eq(APP_ID), eq(USER_ID), anyString(), anyString(), any(), any())).thenReturn(1);
        when(appRepository.findById(APP_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, PublishBuildStatus.BUILDING)));
        service.publish(PROJECT_ID, null);

        verify(builder).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("at the plan's allowance of live apps, publishing another is a PUBLISH_LIMIT quota carrying the numbers")
    void planAllowance() {
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Free", 1, 10_000, 1, false));
        when(appRepository.countLiveOwnedBy(USER_ID)).thenReturn(1);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null))
                .isInstanceOfSatisfying(QuotaExceededException.class, e -> {
                    assertThat(e.getReason()).isEqualTo(QuotaExceededException.Reason.PUBLISH_LIMIT);
                    assertThat(e.getLimit()).isEqualTo(1);
                    assertThat(e.getUsed()).isEqualTo(1);
                    assertThat(e.getPlanName()).isEqualTo("Free");
                    assertThat(e.getMessage()).contains("Free plan keeps 1 app published");
                });

        verify(appRepository, never()).save(any());
        verify(builder, never()).run(anyLong(), anyString(), anyLong(), anyLong());
    }

    @Test
    @DisplayName("an unpublished app counts against the allowance when it goes live again, an update does not")
    void allowanceOnlyForNewlyLiveApps() {
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Free", 1, 10_000, 1, false));
        when(appRepository.countLiveOwnedBy(USER_ID)).thenReturn(1);

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));
        assertThatThrownBy(() -> service.publish(PROJECT_ID, null)).isInstanceOf(QuotaExceededException.class);

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        claimWillSucceed(row(PublishStatus.LIVE, PublishBuildStatus.BUILDING));
        service.publish(PROJECT_ID, null);
        verify(builder).run(eq(APP_ID), anyString(), anyLong(), eq(PROJECT_ID));
    }

    @Test
    @DisplayName("a plan the settings do not list gets the default allowance")
    void unknownPlanGetsTheDefault() {
        when(accountServiceClient.getPlanLimits(USER_ID)).thenReturn(new PlanDto(1L, "Enterprise", 1, 10_000, 1, false));
        when(appRepository.countLiveOwnedBy(USER_ID)).thenReturn(1);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null)).isInstanceOf(QuotaExceededException.class);
    }

    @Test
    @DisplayName("a deleted project cannot be published")
    void deletedProject() {
        project.setDeletedAt(Instant.now());

        assertThatThrownBy(() -> service.publish(PROJECT_ID, null)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    @DisplayName("unpublishing removes the pointer first, then marks the row, then switches sharing off")
    void unpublishOrder() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));

        service.unpublish(PROJECT_ID);

        InOrder order = Mockito.inOrder(store, appRepository, projectRepository);
        order.verify(store).deletePointer("my-todo-app-ab12");
        order.verify(appRepository).markUnpublished(eq(APP_ID), any());
        order.verify(projectRepository).setPublic(PROJECT_ID, false);
    }

    @Test
    @DisplayName("if storage cannot be reached the record is left saying published, so the call can be repeated")
    void unpublishLeavesTheRecordWhenStorageFails() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        doThrow(new FileStorageException("down", null)).when(store).deletePointer(anyString());

        assertThatThrownBy(() -> service.unpublish(PROJECT_ID)).isInstanceOf(FileStorageException.class);

        verify(appRepository, never()).markUnpublished(anyLong(), any());
    }

    @Test
    @DisplayName("unpublishing something never published, or already unpublished, is a quiet no-op")
    void unpublishIsIdempotent() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        service.unpublish(PROJECT_ID);

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));
        service.unpublish(PROJECT_ID);

        verify(store, never()).deletePointer(anyString());
    }

    @Test
    @DisplayName("unpublishing while a first build runs ends that build too")
    void unpublishCancelsABuild() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING)));

        service.unpublish(PROJECT_ID);

        verify(appRepository).markUnpublished(eq(APP_ID), any());
    }

    @Test
    @DisplayName("the code can be shared only while the app is live")
    void sharingNeedsALiveApp() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.setSharing(PROJECT_ID, true)).isInstanceOf(BadRequestException.class);

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));
        assertThatThrownBy(() -> service.setSharing(PROJECT_ID, true)).isInstanceOf(BadRequestException.class);

        verify(projectRepository, never()).setPublic(anyLong(), Mockito.anyBoolean());
    }

    @Test
    @DisplayName("sharing the code of a live app switches the flag and says so in the response")
    void sharingSwitchesTheFlag() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));

        PublishResponse response = service.setSharing(PROJECT_ID, true);

        verify(projectRepository).setPublic(PROJECT_ID, true);
        assertThat(response.shared()).isTrue();
    }

    @Test
    @DisplayName("taking an app down for a deleted project removes the pointer and marks it unpublished")
    void takeDown() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));

        service.takeDown(PROJECT_ID);

        verify(store).deletePointer("my-todo-app-ab12");
        verify(appRepository).markUnpublished(eq(APP_ID), any());
        verify(projectRepository).setPublic(PROJECT_ID, false);
    }

    @Test
    @DisplayName("a take-down that cannot reach storage still marks the app, and the sweeper finishes it")
    void takeDownSurvivesStorageFailure() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        doThrow(new FileStorageException("down", null)).when(store).deletePointer(anyString());

        service.takeDown(PROJECT_ID);

        verify(appRepository).markUnpublished(eq(APP_ID), any());
    }

    @Test
    @DisplayName("taking down a project that was never published does nothing")
    void takeDownNothing() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());

        service.takeDown(PROJECT_ID);

        verify(store, never()).deletePointer(anyString());
        verify(appRepository, never()).markUnpublished(anyLong(), any());
    }

    @Test
    @DisplayName("a project that was never published reports the name its link would get")
    void statusOfANeverPublishedProject() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());

        PublishResponse response = service.getStatus(PROJECT_ID);

        assertThat(response.live()).isFalse();
        assertThat(response.slug()).isNull();
        assertThat(response.suggestedSlug()).matches("my-todo-app-[a-z2-9]{4}");
        assertThat(response.build()).isNull();
    }

    @Test
    @DisplayName("a live app reports its link, and whether the project has moved since")
    void statusOfALiveApp() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));

        PublishResponse unchanged = service.getStatus(PROJECT_ID);
        assertThat(unchanged.live()).isTrue();
        assertThat(unchanged.url()).isEqualTo("http://my-todo-app-ab12.localhost:8090/");
        assertThat(unchanged.hasChanges()).isFalse();
        assertThat(unchanged.suggestedSlug()).isNull();

        project.setCurrentFileRevisionId(4L);
        assertThat(service.getStatus(PROJECT_ID).hasChanges()).isTrue();
    }

    @Test
    @DisplayName("a project with no revision at all matches an app published from none")
    void noRevisionOnEitherSide() {
        project.setCurrentFileRevisionId(null);
        PublishedApp app = row(PublishStatus.LIVE, null);
        app.setLiveRevisionId(null);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(app));

        assertThat(service.getStatus(PROJECT_ID).hasChanges()).isFalse();
    }

    @Test
    @DisplayName("an unpublished app keeps its name but has no link and no changes to offer")
    void statusOfAnUnpublishedApp() {
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));

        PublishResponse response = service.getStatus(PROJECT_ID);

        assertThat(response.live()).isFalse();
        assertThat(response.url()).isNull();
        assertThat(response.slug()).isEqualTo("my-todo-app-ab12");
        assertThat(response.hasChanges()).isFalse();
    }

    @Test
    @DisplayName("shared is reported only while the app is live")
    void sharedOnlyWhileLive() {
        project.setIsPublic(true);
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.LIVE, null)));
        assertThat(service.getStatus(PROJECT_ID).shared()).isTrue();

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(row(PublishStatus.UNPUBLISHED, null)));
        assertThat(service.getStatus(PROJECT_ID).shared()).isFalse();
    }

    @Test
    @DisplayName("a failed update reports why, while the live app stays live")
    void statusOfAFailedUpdate() {
        PublishedApp app = row(PublishStatus.LIVE, PublishBuildStatus.FAILED);
        app.setFailureKind(PublishFailureKind.BUILD);
        app.setFailureDetail("A file has an error in src/App.tsx");
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(app));

        PublishResponse response = service.getStatus(PROJECT_ID);

        assertThat(response.live()).isTrue();
        assertThat(response.build().status()).isEqualTo(PublishBuildStatus.FAILED);
        assertThat(response.build().failureKind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(response.build().failureMessage()).contains("src/App.tsx");
    }

    @Test
    @DisplayName("the build's step is reported while it runs")
    void statusOfARunningBuild() {
        PublishedApp app = row(PublishStatus.UNPUBLISHED, PublishBuildStatus.BUILDING);
        app.setBuildDetail("Installing packages");
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(app));

        assertThat(service.getStatus(PROJECT_ID).build().step()).isEqualTo("Installing packages");
    }

    @Test
    @DisplayName("the build log is the saved output of the last failure, and null when there is none")
    void buildLog() {
        PublishedApp app = row(PublishStatus.LIVE, PublishBuildStatus.FAILED);
        app.setFailureLog("vite build failed");
        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.of(app));
        assertThat(service.getBuildLog(PROJECT_ID).log()).isEqualTo("vite build failed");

        when(appRepository.findByProjectId(PROJECT_ID)).thenReturn(Optional.empty());
        assertThat(service.getBuildLog(PROJECT_ID).log()).isNull();
    }

    @Test
    @DisplayName("the project cards get the link of each live app, keyed by project, in one query")
    void liveUrls() {
        PublishedApp live = row(PublishStatus.LIVE, null);
        when(appRepository.findByProjectIdsAndStatus(List.of(PROJECT_ID, 6L), PublishStatus.LIVE)).thenReturn(List.of(live));

        Map<Long, String> urls = service.liveUrls(List.of(PROJECT_ID, 6L));

        assertThat(urls).containsOnlyKeys(PROJECT_ID);
        assertThat(urls.get(PROJECT_ID)).isEqualTo("http://my-todo-app-ab12.localhost:8090/");
        assertThat(service.liveUrls(List.of())).isEmpty();
        verify(appRepository, Mockito.times(1)).findByProjectIdsAndStatus(any(), any());
    }
}
