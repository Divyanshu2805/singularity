package com.singularity.workspace.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers {@link ProjectNameHeuristic}: what a project made from a description is called and how it is summed up.
 *
 * <p>Handles: a suggested name being kept but never past two words, and a suggested line never past eight; markup,
 * extra lines and control characters being dropped from a suggestion; and, with no suggestion, a name of at most two
 * words and a line of at most eight being made from the description - from a plain sentence and from a brief.
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
    @DisplayName("a suggested line is kept, and is never more than eight words")
    void aSuggestedLineIsKeptToEightWords() {
        assertThat(ProjectNameHeuristic.summaryFrom("A guestbook every visitor can sign", "x"))
                .isEqualTo("A guestbook every visitor can sign");
        assertThat(ProjectNameHeuristic.summaryFrom("one two three four five six seven eight nine ten", "x"))
                .isEqualTo("One two three four five six seven eight");
        assertThat(ProjectNameHeuristic.summaryFrom("A board for tasks and the things that follow them", "x").split(" "))
                .hasSizeLessThanOrEqualTo(8);
    }

    @Test
    @DisplayName("with no suggestion the line is the start of the description, and nothing when there is none")
    void aLineIsMadeFromTheDescription() {
        assertThat(ProjectNameHeuristic.summaryFrom(null, "A digital guestbook that lets anyone visiting the app leave their name and message."))
                .isEqualTo("A digital guestbook that lets anyone visiting");
        assertThat(ProjectNameHeuristic.summaryFrom(null, "**Build:** A kanban board. More here.")).isEqualTo("A kanban board");
        assertThat(ProjectNameHeuristic.summaryFrom(null, "   ")).isNull();
    }
}
