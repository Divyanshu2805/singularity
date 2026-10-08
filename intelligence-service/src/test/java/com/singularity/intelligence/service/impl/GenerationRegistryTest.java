package com.singularity.intelligence.service.impl;

import com.singularity.common.error.ConflictException;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers CODE_REVIEW.md AI-02: two different collaborators must not be able to run a generation against the same
 * project at once, since both would end up writing over the same files. The registry used to key purely on
 * (project, user), which only ever stopped one person from double-submitting - a second member was free to start
 * their own generation on the very same project while the first was still running.
 *
 * <p>Also covers the backstop for an entry that is never removed: a model call once stalled with nothing timing it
 * out, and the project then refused every request as "already generating" until the service was restarted.
 */
class GenerationRegistryTest {

    private static final long PROJECT_ID = 1L;
    private static final long OTHER_PROJECT_ID = 2L;
    private static final long USER_A = 10L;
    private static final long USER_B = 20L;

    private final AtomicReference<Instant> now = new AtomicReference<>(Instant.parse("2026-10-06T10:00:00Z"));
    private final Clock clock = new Clock() {
        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now.get();
        }
    };

    private final GenerationRegistry registry = new GenerationRegistry(clock);

    @Test
    void aSecondMemberCannotStartWhileAnotherMembersGenerationIsRunningOnTheSameProject() {
        registry.start(PROJECT_ID, USER_A, "build a form");

        assertThatThrownBy(() -> registry.start(PROJECT_ID, USER_B, "build a table"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void theSameMemberStartingTwiceIsStillRejectedTooNotJustOtherMembers() {
        registry.start(PROJECT_ID, USER_A, "build a form");

        assertThatThrownBy(() -> registry.start(PROJECT_ID, USER_A, "build a table"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void aDifferentProjectIsUnaffected() {
        registry.start(PROJECT_ID, USER_A, "build a form");

        ActiveGeneration onOtherProject = registry.start(OTHER_PROJECT_ID, USER_B, "build a nav");

        assertThat(registry.find(OTHER_PROJECT_ID, USER_B)).contains(onOtherProject);
    }

    @Test
    void onceTheRunningGenerationIsRemovedAnotherMemberCanStart() {
        ActiveGeneration first = registry.start(PROJECT_ID, USER_A, "build a form");
        registry.remove(first);

        ActiveGeneration second = registry.start(PROJECT_ID, USER_B, "build a table");

        assertThat(registry.find(PROJECT_ID, USER_B)).contains(second);
    }

    @Test
    void aMemberCanOnlyFindTheirOwnGenerationNeverAnotherMembersEvenThoughOnlyOneRunsAtATime() {
        registry.start(PROJECT_ID, USER_A, "build a form");

        assertThat(registry.find(PROJECT_ID, USER_B)).isEmpty();
    }

    @Test
    void anEntryThatHasOutlivedAnyPossibleTurnIsClearedSoTheProjectIsNotLockedForGood() {
        ActiveGeneration abandoned = registry.start(PROJECT_ID, USER_A, "build a form");
        now.set(now.get().plus(GenerationRegistry.STALE_AFTER).plusSeconds(1));

        ActiveGeneration fresh = registry.start(PROJECT_ID, USER_B, "build a table");

        assertThat(registry.find(PROJECT_ID, USER_B)).contains(fresh);
        assertThat(registry.find(PROJECT_ID, USER_A)).isEmpty();
        assertThat(abandoned.status()).isEqualTo(ActiveGeneration.Status.FINISHED);
    }

    @Test
    void anEntryThatIsOldButStillWithinATurnsLifetimeStillBlocksASecondTurn() {
        registry.start(PROJECT_ID, USER_A, "build a form");
        now.set(now.get().plus(GenerationRegistry.STALE_AFTER).minusSeconds(1));

        assertThatThrownBy(() -> registry.start(PROJECT_ID, USER_B, "build a table"))
                .isInstanceOf(ConflictException.class);
    }
}
