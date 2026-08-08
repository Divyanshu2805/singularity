package com.vibecraft.intelligence.service.impl;

import com.vibecraft.common.error.ConflictException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers CODE_REVIEW.md AI-02: two different collaborators must not be able to run a generation against the same
 * project at once, since both would end up writing over the same files. The registry used to key purely on
 * (project, user), which only ever stopped one person from double-submitting - a second member was free to start
 * their own generation on the very same project while the first was still running.
 */
class GenerationRegistryTest {

    private static final long PROJECT_ID = 1L;
    private static final long OTHER_PROJECT_ID = 2L;
    private static final long USER_A = 10L;
    private static final long USER_B = 20L;

    private final GenerationRegistry registry = new GenerationRegistry();

    @Test
    void aSecondMemberCannotStartWhileAnotherMembersGenerationIsRunningOnTheSameProject() {
        registry.start(PROJECT_ID, USER_A, "build a form", false);

        assertThatThrownBy(() -> registry.start(PROJECT_ID, USER_B, "build a table", false))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void theSameMemberStartingTwiceIsStillRejectedTooNotJustOtherMembers() {
        registry.start(PROJECT_ID, USER_A, "build a form", false);

        assertThatThrownBy(() -> registry.start(PROJECT_ID, USER_A, "build a table", false))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void aDifferentProjectIsUnaffected() {
        registry.start(PROJECT_ID, USER_A, "build a form", false);

        ActiveGeneration onOtherProject = registry.start(OTHER_PROJECT_ID, USER_B, "build a nav", false);

        assertThat(registry.find(OTHER_PROJECT_ID, USER_B)).contains(onOtherProject);
    }

    @Test
    void onceTheRunningGenerationIsRemovedAnotherMemberCanStart() {
        ActiveGeneration first = registry.start(PROJECT_ID, USER_A, "build a form", false);
        registry.remove(first);

        ActiveGeneration second = registry.start(PROJECT_ID, USER_B, "build a table", false);

        assertThat(registry.find(PROJECT_ID, USER_B)).contains(second);
    }

    @Test
    void aMemberCanOnlyFindTheirOwnGenerationNeverAnotherMembersEvenThoughOnlyOneRunsAtATime() {
        registry.start(PROJECT_ID, USER_A, "build a form", false);

        assertThat(registry.find(PROJECT_ID, USER_B)).isEmpty();
    }
}
