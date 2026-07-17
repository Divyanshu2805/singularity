package com.java.vibecraft.util;

import com.java.vibecraft.dto.code.CodeSearchFileResult;
import com.java.vibecraft.dto.code.CodeSearchMatch;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The line-by-line half of code search - the part with the off-by-one and column-offset risk. */
class CodeSearchScannerTest {

    private static final String FILE = """
            import { useState } from "react";

            export function Counter() {
              const [count, setCount] = useState(0);
              return <button onClick={() => setCount(count + 1)}>{count}</button>;
            }
            """;

    @Test
    void reportsOneBasedLineNumbersMatchingWhatTheEditorShows() {
        CodeSearchFileResult result = CodeSearchScanner.scan("src/Counter.tsx", FILE, "useState", 50);

        assertThat(result).isNotNull();
        assertThat(result.path()).isEqualTo("src/Counter.tsx");
        // Line 1 is the import and line 4 the hook call - not 0 and 3.
        assertThat(result.matches()).extracting(CodeSearchMatch::line).containsExactly(1, 4);
    }

    @Test
    void matchesRegardlessOfCase() {
        assertThat(CodeSearchScanner.scan("a.tsx", FILE, "USESTATE", 50)).isNotNull();
        assertThat(CodeSearchScanner.scan("a.tsx", FILE, "usestate", 50)).isNotNull();
    }

    @Test
    void treatsTheQueryAsLiteralTextRatherThanARegex() {
        // Someone searching code types things like "useState(" - as a regex that's an unclosed group.
        CodeSearchFileResult result = CodeSearchScanner.scan("a.tsx", FILE, "useState(0)", 50);
        assertThat(result).isNotNull();
        assertThat(result.matches()).extracting(CodeSearchMatch::line).containsExactly(4);

        // And "." must not match every character.
        assertThat(CodeSearchScanner.scan("a.tsx", "const a = 1;", ".", 50)).isNull();
    }

    @Test
    void trimsIndentationForDisplayAndShiftsTheColumnToMatch() {
        CodeSearchFileResult result = CodeSearchScanner.scan("a.tsx", FILE, "count", 50);
        CodeSearchMatch hookLine = result.matches().stream().filter(m -> m.line() == 4).findFirst().orElseThrow();

        assertThat(hookLine.text()).isEqualTo("const [count, setCount] = useState(0);");
        // The column indexes into the trimmed text the client renders, not the raw indented line.
        assertThat(hookLine.text().substring(hookLine.column(), hookLine.column() + hookLine.length()))
                .isEqualTo("count");
    }

    @Test
    void reportsTruncationRatherThanSilentlyReturningAPartialCount() {
        String many = "match\n".repeat(10);

        CodeSearchFileResult capped = CodeSearchScanner.scan("a.txt", many, "match", 3);
        assertThat(capped.matches()).hasSize(3);
        assertThat(capped.truncated()).isTrue();

        CodeSearchFileResult complete = CodeSearchScanner.scan("a.txt", many, "match", 50);
        assertThat(complete.matches()).hasSize(10);
        assertThat(complete.truncated()).isFalse();
    }

    @Test
    void windowsAVeryLongLineAroundTheMatchSoTheHitStaysVisible() {
        String longLine = "x".repeat(5000) + "NEEDLE" + "y".repeat(5000);

        CodeSearchMatch match = CodeSearchScanner.scan("min.js", longLine, "NEEDLE", 50).matches().getFirst();

        assertThat(match.text()).hasSizeLessThanOrEqualTo(CodeSearchScanner.MAX_LINE_CHARS);
        assertThat(match.text().substring(match.column(), match.column() + match.length())).isEqualTo("NEEDLE");
    }

    @Test
    void returnsNullForNoMatchSoTheFileCanBeSkippedEntirely() {
        assertThat(CodeSearchScanner.scan("a.tsx", FILE, "useEffect", 50)).isNull();
        assertThat(CodeSearchScanner.scan("a.tsx", "", "anything", 50)).isNull();
        assertThat(CodeSearchScanner.scan("a.tsx", FILE, "", 50)).isNull();
    }

    @Test
    void handlesWindowsLineEndingsWithoutLeavingCarriageReturnsInTheResult() {
        CodeSearchMatch match = CodeSearchScanner.scan("a.tsx", "const a = 1;\r\nconst b = 2;\r\n", "const b", 50)
                .matches().getFirst();

        assertThat(match.line()).isEqualTo(2);
        assertThat(match.text()).isEqualTo("const b = 2;");
    }
}
