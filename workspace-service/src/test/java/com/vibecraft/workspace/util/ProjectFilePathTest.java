package com.vibecraft.workspace.util;

import com.vibecraft.common.error.BadRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Covers the storage boundary for project file paths: that the two spellings the AI protocol emits for one file
 * normalise to the same stored form, and that anything able to escape the project is rejected rather than stored.
 *
 * <p>The traversal cases matter beyond object storage, which treats a key as opaque: a stored path is used verbatim
 * as a ZIP entry name and as the destination of the mirror into a preview pod, and both of those do resolve
 * parent-directory segments.
 */
class ProjectFilePathTest {

    @Test
    @DisplayName("both spellings the AI protocol emits normalise to one stored path")
    void leadingSlashIsStripped() {
        assertThat(ProjectFilePath.normalize("/src/App.tsx")).isEqualTo("src/App.tsx");
        assertThat(ProjectFilePath.normalize("src/App.tsx")).isEqualTo("src/App.tsx");
        assertThat(ProjectFilePath.normalize("  src/App.tsx  ")).isEqualTo("src/App.tsx");
    }

    @Test
    @DisplayName("the object key is the project id plus the normalised path")
    void objectKeyIsScopedToTheProject() {
        assertThat(ProjectFilePath.objectKey(22L, "/src/App.tsx")).isEqualTo("22/src/App.tsx");
        assertThat(ProjectFilePath.objectKey(22L, "src/App.tsx")).isEqualTo("22/src/App.tsx");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "../33/src/App.tsx",
            "src/../../33/App.tsx",
            "./src/App.tsx",
            "src/./App.tsx",
            "..",
            "/../etc/passwd",
            "src//App.tsx",
            "src/App.tsx/",
            "src\\App.tsx",
            "C:/Windows/system32",
            "\u0000src/App.tsx",
    })
    @DisplayName("a path that could escape the project is rejected")
    void rejectsEscapingPaths(String path) {
        assertThatThrownBy(() -> ProjectFilePath.normalize(path)).isInstanceOf(BadRequestException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "invoice\u202Egnp.exe",
            "\u200Bsrc/App.tsx",
            "src/App\u200D.tsx",
            "\uFEFFsrc/App.tsx",
            "src/App.tsx\u202C",
    })
    @DisplayName("a Unicode bidi-override or zero-width character is rejected, since ASCII control checks miss it")
    void rejectsUnicodeFormatCharacters(String path) {
        assertThatThrownBy(() -> ProjectFilePath.normalize(path)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("two Unicode encodings of the same visual filename normalise to one identical stored path")
    void collapsesUnicodeNormalizationForms() {
        String precomposed = "src/caf\u00e9.tsx";
        String combining = "src/cafe\u0301.tsx";

        assertThat(precomposed).isNotEqualTo(combining);
        assertThat(ProjectFilePath.normalize(combining)).isEqualTo(ProjectFilePath.normalize(precomposed));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "/"})
    @DisplayName("a blank path is rejected")
    void rejectsBlank(String path) {
        assertThatThrownBy(() -> ProjectFilePath.normalize(path)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("a null path is rejected rather than reaching storage")
    void rejectsNull() {
        assertThatThrownBy(() -> ProjectFilePath.normalize(null)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("an over-long path is rejected, so no key or ZIP entry is unbounded")
    void rejectsOverLongPaths() {
        String tooLong = "src/" + "a".repeat(ProjectFilePath.MAX_LENGTH);
        assertThatThrownBy(() -> ProjectFilePath.normalize(tooLong)).isInstanceOf(BadRequestException.class);
    }

    @Test
    @DisplayName("a dot inside a name is fine - only a whole '.' or '..' segment is a traversal")
    void allowsDotsInsideNames() {
        assertThat(ProjectFilePath.normalize("src/app.test.tsx")).isEqualTo("src/app.test.tsx");
        assertThat(ProjectFilePath.normalize(".env.example")).isEqualTo(".env.example");
        assertThat(ProjectFilePath.normalize("..hidden/file.ts")).isEqualTo("..hidden/file.ts");
    }
}
