package com.java.vibecraft.llm;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The code lens's prompts. The selection's placement is the part worth pinning: sent as a message of its own
 * ahead of the replayed conversation, it was far enough from the question that the model answered "I don't
 * have a code selection in this message" while the editor was plainly showing one.
 */
class CodeInsightPromptsTest {

    private static final String SELECTION = CodeInsightPrompts.selectionBlock(
            "src/types/notes.ts", 20, 23, "export interface NotesData {\n  groups: Group[];\n}");

    @Test
    @DisplayName("the selected code is quoted inside the question, not left in an earlier message")
    void selectionRidesOnTheQuestion() {
        String message = CodeInsightPrompts.questionBlock(SELECTION, "what is this code?");

        assertThat(message)
                .startsWith("Selected code from src/types/notes.ts lines 20-23:")
                .contains("export interface NotesData {")
                .endsWith("what is this code?");
    }

    @Test
    @DisplayName("a question with no selection is sent exactly as asked")
    void questionWithoutSelection() {
        assertThat(CodeInsightPrompts.questionBlock(null, "where is routing set up?"))
                .isEqualTo("where is routing set up?");
        assertThat(CodeInsightPrompts.questionBlock("   ", "where is routing set up?"))
                .isEqualTo("where is routing set up?");
    }

    @Test
    @DisplayName("the selection names where it came from, so an answer can point back at it")
    void selectionNamesItsPlace() {
        assertThat(CodeInsightPrompts.selectionBlock("src/App.tsx", 4, 4, "const a = 1;"))
                .contains("src/App.tsx line 4");
        assertThat(CodeInsightPrompts.selectionBlock("src/App.tsx", 4, 9, "const a = 1;"))
                .contains("src/App.tsx lines 4-9");
        assertThat(CodeInsightPrompts.selectionBlock("src/App.tsx", null, null, "const a = 1;"))
                .contains("src/App.tsx");
    }

    @Test
    @DisplayName("the ask prompt tells the model where the selection now is, and that it can read files")
    void askPromptMatchesTheMessageOrder() {
        String prompt = CodeInsightPrompts.askSystemPrompt();

        assertThat(prompt).contains("LAST message");
        assertThat(prompt).contains("quoted immediately above the question");
        assertThat(prompt).contains("read_files");
        // Read-only stays true of the prompt as well as of the code: the file-writing protocol is only ever
        // named to forbid it, never taught, so the model has no shape to emit an edit in.
        assertThat(prompt).contains("READ-ONLY");
        assertThat(prompt).contains("Never output XML-ish tags");
        assertThat(prompt).doesNotContain("path=");
    }

    @Test
    @DisplayName("the file list points at the tool rather than asking the reader to open something")
    void fileListMentionsTheTool() {
        String block = CodeInsightPrompts.fileListBlock(List.of("src/App.tsx", "src/main.tsx"), 2);

        assertThat(block).contains("read_files");
        assertThat(block).contains("- src/App.tsx");
    }
}
