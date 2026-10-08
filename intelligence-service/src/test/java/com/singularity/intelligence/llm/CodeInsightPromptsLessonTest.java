package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.CodeInsightPrompts.LessonStep;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The step lesson of teaching mode: what the model is given - the request, the turn's steps with this one marked and
 * only the lines the step changed - and a prompt that asks for one story about that change and stays read-only and
 * tag-free like the rest of the code lens.
 */
class CodeInsightPromptsLessonTest {

    private static final List<LessonStep> STEPS = List.of(
            new LessonStep("Add light theme colours", "src/index.css"),
            new LessonStep("Add the theme  toggle\n button", "src/Slideshow.tsx"),
            new LessonStep("Keep the theme on the page", "src/Index.tsx"));

    private static final String BEFORE = "import { useState } from 'react';\n\nexport function Slideshow() {\n  return <nav />;\n}\n";
    private static final String AFTER = "import { useState } from 'react';\n\nexport function Slideshow() {\n"
            + "  const [theme, setTheme] = useState('dark');\n  return <nav />;\n}\n";

    @Test
    @DisplayName("a changed file is sent as its changed lines only, under the request and the steps with this one marked")
    void aChangedFileIsSentAsItsChange() {
        String block = CodeInsightPrompts.lessonBlock("add a theme toggle", STEPS, "src/Slideshow.tsx", BEFORE, AFTER);

        assertThat(block).startsWith("What the person asked for:\nadd a theme toggle\n\nThe steps of this build, in order:\n")
                .contains("1. Add light theme colours (src/index.css)\n")
                .contains("2. Add the theme toggle button (src/Slideshow.tsx)   <- this lesson\n")
                .contains("This lesson is about step 2 of 3.")
                .contains("This step changed src/Slideshow.tsx, which already existed (it now has 6 lines).")
                .contains("+ 4 |   const [theme, setTheme] = useState('dark');")
                .contains("  5 |   return <nav />;")
                .doesNotContain("The whole file is the change");
    }

    @Test
    @DisplayName("a file the step created is sent whole, every line numbered")
    void aNewFileIsSentWhole() {
        String created = CodeInsightPrompts.lessonBlock("add a theme toggle", STEPS, "src/Slideshow.tsx", null, AFTER);
        String overNothing = CodeInsightPrompts.lessonBlock("add a theme toggle", STEPS, "src/Slideshow.tsx", "", AFTER);

        assertThat(created).contains("This step created src/Slideshow.tsx (6 lines). The whole file is the change:")
                .contains("1 | import { useState } from 'react';").endsWith("6 | }").doesNotContain("+ ");
        assertThat(overNothing).isEqualTo(created);
    }

    @Test
    @DisplayName("a file no step names is said to have been written alongside them, and a turn with no steps lists none")
    void aFileOutsideTheStepsSaysSo() {
        String alongside = CodeInsightPrompts.lessonBlock("add a theme toggle", STEPS, "src/theme.ts", null, "export {};");
        String noSteps = CodeInsightPrompts.lessonBlock(null, List.of(), "src/theme.ts", null, "export {};");

        assertThat(alongside).contains("written alongside those steps").doesNotContain("<- this lesson");
        assertThat(noSteps).startsWith("This step created src/theme.ts (1 line).");
    }

    @Test
    @DisplayName("a very long request and a very long change are both cut, and the cut is said")
    void longInputIsBounded() {
        String longFile = ("const value = 'a reasonably long line of code to fill the file';\n").repeat(1200);

        String block = CodeInsightPrompts.lessonBlock("x".repeat(5000), List.of(), "src/big.ts", null, longFile);

        assertThat(block.length()).isLessThan(33_000);
        assertThat(block).contains("x".repeat(1500) + " ...").doesNotContain("x".repeat(1501))
                .endsWith("(The change goes on past this point and is not shown. Say that it does.)");
    }

    @Test
    @DisplayName("the lesson prompt asks for one story about the change, in line-range sections, with no tool and no write protocol")
    void theLessonPromptIsReadOnlyAndShaped() {
        String prompt = CodeInsightPrompts.lessonSystemPrompt();

        assertThat(prompt).contains("### L12-18 ·").contains("### What happens next")
                .contains("Explain the change, and only the change.").contains("as one story")
                .contains("you need no tool").contains("READ-ONLY");
        assertThat(prompt).doesNotContain("<file").doesNotContain("<todo").doesNotContain("<learn").doesNotContain("read_files");
    }
}
