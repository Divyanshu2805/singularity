package com.singularity.workspace.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers {@link ProjectNameHeuristic}: what a project made from a description is called and how it is summed up.
 *
 * <p>Handles: a suggested name being kept but never past two words, and a suggested title never past eight; markup,
 * extra lines and control characters being dropped from a suggestion; with no suggestion, a name of at most two words
 * being made from the description - from a plain sentence and from a brief - and no title being made at all, so a
 * model writes one.
 */
class ProjectNameHeuristicTest {

    @Test
    @DisplayName("a suggested name is kept, and is never more than two words")
    void aSuggestedNameIsKeptToTwoWords() {
        assertThat(ProjectNameHeuristic.nameFrom("Guestbook", "a guestbook everyone can sign")).isEqualTo("Guestbook");
        assertThat(ProjectNameHeuristic.nameFrom("  kanban board  ", "x")).isEqualTo("Kanban board");
        assertThat(ProjectNameHeuristic.nameFrom("My Very Long App Name", "x")).isEqualTo("My Very");
        assertThat(ProjectNameHeuristic.nameFrom("**TaskApp**\nsecond line", "x")).isEqualTo("TaskApp");
        assertThat(ProjectNameHeuristic.nameFrom("Task\u0007App", "x")).isEqualTo("Task App");
    }

    @Test
    @DisplayName("with no usable suggestion the name is made from the description, in at most two words")
    void aNameIsMadeFromTheDescription() {
        assertThat(ProjectNameHeuristic.nameFrom(null, "Can you build me a guestbook everyone who opens the app can sign"))
                .isEqualTo("Guestbook everyone");
        assertThat(ProjectNameHeuristic.nameFrom("   ", "a kanban board")).isEqualTo("Kanban board");
        assertThat(ProjectNameHeuristic.nameFrom("", "todo app with drag and drop")).isEqualTo("Todo app");
        assertThat(ProjectNameHeuristic.nameFrom(null, "**Build:** A recipe box for one cook.")).isEqualTo("Recipe box");
        assertThat(ProjectNameHeuristic.nameFrom(null, "the")).isEqualTo("Untitled project");
    }

    @Test
    @DisplayName("a suggested title is kept, and is never more than eight words")
    void aSuggestedTitleIsKeptToEightWords() {
        assertThat(ProjectNameHeuristic.summaryFrom("Guestbook every visitor can sign"))
                .isEqualTo("Guestbook every visitor can sign");
        assertThat(ProjectNameHeuristic.summaryFrom("one two three four five six seven eight nine ten"))
                .isEqualTo("One two three four five six seven eight");
        assertThat(ProjectNameHeuristic.summaryFrom("A board for tasks and the things that follow them").split(" "))
                .hasSizeLessThanOrEqualTo(8);
        assertThat(ProjectNameHeuristic.summaryFrom("**Notes app**\nignore the rest")).isEqualTo("Notes app");
    }

    @Test
    @DisplayName("with no usable suggestion there is no title, so the app shows the name until a model writes one")
    void noSuggestionMeansNoTitle() {
        assertThat(ProjectNameHeuristic.summaryFrom(null)).isNull();
        assertThat(ProjectNameHeuristic.summaryFrom("   ")).isNull();
        assertThat(ProjectNameHeuristic.summaryFrom("\"\"")).isNull();
    }
}
