package com.singularity.workspace.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for {@link GitHubRepoName}, the rules for the name of a repository a project is pushed to.
 *
 * <p>Handles: the names GitHub takes being accepted and each kind it refuses being refused with a sentence, and a
 * suggested name being made from a project's name whatever that holds. The browser's copy of the rules
 * ({@code lib/github.test.ts}) holds the same cases.
 */
class GitHubRepoNameTest {

    @Test
    void namesGitHubTakesAreAccepted() {
        assertThat(GitHubRepoName.problem("noughts")).isNull();
        assertThat(GitHubRepoName.problem("My_App-2.0")).isNull();
        assertThat(GitHubRepoName.problem("a")).isNull();
        assertThat(GitHubRepoName.problem("a".repeat(100))).isNull();
    }

    @Test
    void eachKindOfBadNameIsRefusedWithASentence() {
        assertThat(GitHubRepoName.problem(null)).isEqualTo("Give the repository a name.");
        assertThat(GitHubRepoName.problem("  ")).isEqualTo("Give the repository a name.");
        assertThat(GitHubRepoName.problem("a".repeat(101))).contains("at most 100");
        assertThat(GitHubRepoName.problem("my app")).contains("letters, digits, dots, hyphens and underscores");
        assertThat(GitHubRepoName.problem("owner/repo")).contains("letters, digits");
        assertThat(GitHubRepoName.problem("café")).contains("letters, digits");
        assertThat(GitHubRepoName.problem("..")).contains("dots alone");
        assertThat(GitHubRepoName.problem(".")).contains("dots alone");
        assertThat(GitHubRepoName.problem("thing.GIT")).contains(".git");
    }

    @Test
    void aSuggestionIsMadeFromTheProjectsName() {
        assertThat(GitHubRepoName.suggest("Noughts & Crosses!")).isEqualTo("noughts-crosses");
        assertThat(GitHubRepoName.suggest("  My App  ")).isEqualTo("my-app");
        assertThat(GitHubRepoName.suggest("éè")).isEqualTo("singularity-app");
        assertThat(GitHubRepoName.suggest(null)).isEqualTo("singularity-app");
        assertThat(GitHubRepoName.suggest("x".repeat(80) + " tail")).hasSize(60);
        assertThat(GitHubRepoName.problem(GitHubRepoName.suggest("Any thing: at all / here"))).isNull();
    }
}
