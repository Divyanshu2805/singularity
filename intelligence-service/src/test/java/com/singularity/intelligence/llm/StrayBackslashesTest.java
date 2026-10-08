package com.singularity.intelligence.llm;

import com.singularity.intelligence.llm.StrayBackslashes.Tidied;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers taking a stray backslash off the end of a line of generated code.
 *
 * <p>The first two cases are the lines a real turn saved, which stopped the project compiling. The rest are the
 * backslashes that must survive: a line continuation inside a string or a template literal, one in a comment, one in
 * the middle of a line, and anything in a file that is not JavaScript or TypeScript.
 */
class StrayBackslashesTest {

    private static Tidied tidy(String content) {
        return StrayBackslashes.remove("src/pages/ClientAccess.tsx", content);
    }

    @Test
    void theBackslashARealTurnLeftAfterAJsxAttributeIsRemovedAndNothingElseOnTheLineChanges() {
        String broken = """
                <button
                  disabled={isDownloading}
                  onClick={() => handleBatchDownload('all')}\\
                  className="px-4 py-2.5"
                >
                """;

        Tidied tidied = tidy(broken);

        assertThat(tidied.removed()).isEqualTo(1);
        assertThat(tidied.content()).isEqualTo(broken.replace("}\\\n", "}\n"));
    }

    @Test
    void theOneItLeftAfterAnOpeningBraceIsRemovedToo() {
        Tidied tidied = tidy("const [formData, setFormData] = useState<InquiryData>({\\\n  name: '',\n});\n");

        assertThat(tidied.removed()).isEqualTo(1);
        assertThat(tidied.content()).isEqualTo("const [formData, setFormData] = useState<InquiryData>({\n  name: '',\n});\n");
    }

    @Test
    void spacesBetweenTheBackslashAndTheLineEndGoWithItAndAWindowsLineEndingIsKept() {
        assertThat(tidy("const a = 1; \\  \nconst b = 2;\n").content()).isEqualTo("const a = 1;\nconst b = 2;\n");
        assertThat(tidy("const a = 1;\\\r\nconst b = 2;\r\n").content()).isEqualTo("const a = 1;\r\nconst b = 2;\r\n");
        assertThat(tidy("const a = 1;\\").content()).isEqualTo("const a = 1;");
    }

    @Test
    void aLineContinuationInsideAStringIsLeftAlone() {
        String valid = "const text = 'first \\\nsecond';\nconst other = \"first \\\nsecond\";\n";

        assertThat(tidy(valid)).isEqualTo(new Tidied(valid, 0));
    }

    @Test
    void aLineContinuationInsideATemplateLiteralIsLeftAloneIncludingAfterAnExpressionInIt() {
        String valid = "const text = `first ${names.map((n) => `<${n}>`).join('')} \\\nsecond`;\nconst a = 1;\n";

        assertThat(tidy(valid)).isEqualTo(new Tidied(valid, 0));
    }

    @Test
    void codeInsideATemplateExpressionIsStillCodeAndCodeAfterTheTemplateIsToo() {
        Tidied tidied = tidy("const a = `x ${fn({ b: 1 })} y`;\\\nconst c = 2;\\\n");

        assertThat(tidied.removed()).isEqualTo(2);
        assertThat(tidied.content()).isEqualTo("const a = `x ${fn({ b: 1 })} y`;\nconst c = 2;\n");
    }

    @Test
    void aBackslashInACommentOrInTheMiddleOfALineIsLeftAlone() {
        String valid = "// a path like C:\\\nconst pattern = /\\d+\\s/;\n/* ends with one \\\n */\nconst tab = '\\t';\n";

        assertThat(tidy(valid)).isEqualTo(new Tidied(valid, 0));
    }

    @Test
    void anApostropheInJsxTextCannotMakeItTakeABackslashOutOfARealString() {
        String valid = "<p>Don't worry</p>\nconst text = 'first \\\nsecond';\n";

        assertThat(tidy(valid)).isEqualTo(new Tidied(valid, 0));
    }

    @Test
    void anEscapedQuoteDoesNotEndTheStringItIsIn() {
        String valid = "const text = 'it\\'s \\\nfine';\n";

        assertThat(tidy(valid)).isEqualTo(new Tidied(valid, 0));
    }

    @Test
    void onlyJavaScriptAndTypeScriptFilesAreTouched() {
        String css = ".a::after { content: \"a\\\nb\"; }\\\n";

        assertThat(StrayBackslashes.remove("src/index.css", css)).isEqualTo(new Tidied(css, 0));
        assertThat(StrayBackslashes.remove("README.md", "a\\\n")).isEqualTo(new Tidied("a\\\n", 0));
        assertThat(StrayBackslashes.remove(null, "a\\\n").removed()).isZero();
        assertThat(StrayBackslashes.remove("src/a.ts", null).content()).isNull();
        assertThat(StrayBackslashes.remove("src/hooks/useTasks.TS", "const a = 1;\\\n").removed()).isEqualTo(1);
    }

    @Test
    void aFileWithNothingWrongComesBackAsTheSameString() {
        String clean = "export const a = 1;\n";

        assertThat(tidy(clean).content()).isSameAs(clean);
    }
}
