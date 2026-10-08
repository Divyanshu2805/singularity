package com.singularity.intelligence.llm;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers what a lesson is written from: only the lines a step changed, numbered as the editor numbers the new file,
 * so a lesson on a small change to a long file is about the change and every line it points at is where it says.
 */
class ChangedLinesTest {

    private static String file(int lines) {
        List<String> text = new ArrayList<>();
        for (int i = 1; i <= lines; i++) {
            text.add("line " + i);
        }
        return String.join("\n", text) + "\n";
    }

    @Test
    @DisplayName("one added line in a long file is shown with a few lines around it, and nothing else")
    void onlyTheChangeIsShown() {
        String before = file(40);
        String after = before.replace("line 20\n", "line 20\nconst theme = 'dark';\n");

        String changed = ChangedLines.between(before, after, 2);

        assertThat(changed).isEqualTo(String.join("\n",
                "  19 | line 19",
                "  20 | line 20",
                "+ 21 | const theme = 'dark';",
                "  22 | line 21",
                "  23 | line 22"));
    }

    @Test
    @DisplayName("a rewritten line is its old text without a number, then its new text with the new file's number")
    void aRewrittenLineShowsBothVersions() {
        String changed = ChangedLines.between("a\nb\nc\n", "a\nB\nc\n", 1);

        assertThat(changed).isEqualTo(String.join("\n", "  1 | a", "-   | b", "+ 2 | B", "  3 | c"));
    }

    @Test
    @DisplayName("lines that were only removed are shown where they used to be")
    void removedLinesAreShown() {
        String changed = ChangedLines.between("a\nb\nc\nd\n", "a\nd\n", 1);

        assertThat(changed).isEqualTo(String.join("\n", "  1 | a", "-   | b", "-   | c", "  2 | d"));
    }

    @Test
    @DisplayName("changes far apart are separate parts, and changes close together are one")
    void distantChangesAreSeparateParts() {
        String before = file(40);
        String far = before.replace("line 5\n", "line five\n").replace("line 30\n", "line thirty\n");
        String near = before.replace("line 5\n", "line five\n").replace("line 8\n", "line eight\n");

        assertThat(ChangedLines.between(before, far, 1)).contains("\n...\n").contains("+  5 | line five").contains("+ 30 | line thirty");
        assertThat(ChangedLines.between(before, near, 2)).doesNotContain("...").contains("   6 | line 6").contains("   7 | line 7");
    }

    @Test
    @DisplayName("a change that is only trailing spaces or line endings is no change")
    void invisibleChangesAreIgnored() {
        assertThat(ChangedLines.between("a\nb\n", "a  \r\nb\r\n\n", 3)).isEmpty();
    }

    @Test
    @DisplayName("a whole file is numbered from one, a leading blank line keeping its number")
    void aWholeFileIsNumberedAsTheEditorNumbersIt() {
        assertThat(ChangedLines.numbered("\nfirst   \nsecond\n\n")).isEqualTo("1 | \n2 | first\n3 | second");
        assertThat(ChangedLines.numbered(file(11))).contains(" 1 | line 1\n").endsWith("11 | line 11");
    }

    @Test
    @DisplayName("two versions too far apart to compare line by line are one replaced block")
    void aHugeRewriteIsOneBlock() {
        List<String> before = new ArrayList<>();
        List<String> after = new ArrayList<>();
        for (int i = 0; i < 1300; i++) {
            before.add("old " + i);
            after.add("new " + i);
        }

        String changed = ChangedLines.between(String.join("\n", before), String.join("\n", after), 1);

        assertThat(changed).startsWith("-      | old 0").endsWith("+ 1300 | new 1299");
    }
}
