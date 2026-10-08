package com.singularity.intelligence.llm;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the tidying of a path the model wrote: the spellings of one file that must collapse to its stored form, and
 * the paths that must be refused outright.
 *
 * <p>A turn publishes as one revision and workspace-service rejects the whole of it when a single path is invalid, so
 * a harmless {@code ./} used to cost every other file the turn wrote. It also strips whatever Java calls whitespace
 * from a path's ends before storing it, so a path that came out of here still wearing one would be recorded under one
 * name and stored under another; the sweep over every character pins that nothing is left for it to strip.
 */
class GeneratedPathTest {

    @Test
    void theSpellingsAModelUsesForOneFileCollapseToItsStoredPath() {
        assertThat(GeneratedPath.normalize("src/App.tsx")).contains("src/App.tsx");
        assertThat(GeneratedPath.normalize("./src/App.tsx")).contains("src/App.tsx");
        assertThat(GeneratedPath.normalize("/src/App.tsx")).contains("src/App.tsx");
        assertThat(GeneratedPath.normalize("  src/App.tsx  ")).contains("src/App.tsx");
        assertThat(GeneratedPath.normalize("src\\components\\Nav.tsx")).contains("src/components/Nav.tsx");
        assertThat(GeneratedPath.normalize("src//./pages/Index.tsx")).contains("src/pages/Index.tsx");
    }

    @Test
    void aPathThatCouldLeaveTheProjectIsRefused() {
        assertThat(GeneratedPath.normalize("../secrets.txt")).isEmpty();
        assertThat(GeneratedPath.normalize("src/../../etc/passwd")).isEmpty();
        assertThat(GeneratedPath.normalize("C:/Windows/system.ini")).isEmpty();
        assertThat(GeneratedPath.normalize("C:\\Windows\\system.ini")).isEmpty();
    }

    @Test
    void aPathThatIsNotAFileIsRefused() {
        assertThat(GeneratedPath.normalize(null)).isEmpty();
        assertThat(GeneratedPath.normalize("   ")).isEmpty();
        assertThat(GeneratedPath.normalize("/")).isEmpty();
        assertThat(GeneratedPath.normalize("src/components/")).isEmpty();
        assertThat(GeneratedPath.normalize("a".repeat(GeneratedPath.MAX_LENGTH + 1))).isEmpty();
    }

    @Test
    void controlAndDirectionOverrideCharactersAreRefused() {
        assertThat(GeneratedPath.normalize("src/a\u0000b.ts")).isEmpty();
        assertThat(GeneratedPath.normalize("src/photo\u202Egnp.exe")).isEmpty();
        assertThat(GeneratedPath.normalize("src/tab\there.ts")).isEmpty();
    }

    @Test
    void aSpaceOtherThanThePlainOneIsRefusedWhereverItSits() {
        assertThat(GeneratedPath.normalize("src/App.tsx ")).isEmpty();
        assertThat(GeneratedPath.normalize(" src/App.tsx")).isEmpty();
        assertThat(GeneratedPath.normalize("src/my file.ts")).isEmpty();
        assertThat(GeneratedPath.normalize("src/App.tsx ")).isEmpty();
        assertThat(GeneratedPath.normalize("\u001Fsrc/App.tsx")).isEmpty();
        assertThat(GeneratedPath.normalize("﻿src/App.tsx")).isEmpty();

        assertThat(GeneratedPath.normalize("src/my file.ts")).contains("src/my file.ts");
        assertThat(GeneratedPath.normalize(" \t\r\nsrc/my file.ts\f\u000B ")).contains("src/my file.ts");
    }

    @Test
    void whatComesOutIsNeverStrippedFurtherByTheFileStore() {
        for (int codePoint = 0; codePoint <= 0xFFFF; codePoint++) {
            if (Character.isSurrogate((char) codePoint)) {
                continue;
            }
            String edge = Character.toString(codePoint);
            String label = "U+%04X".formatted(codePoint);

            GeneratedPath.normalize(edge + "src/App.tsx" + edge)
                    .ifPresent(path -> assertThat(path).as(label).isEqualTo(path.strip()));
        }
    }

    @Test
    void twoByteSpellingsOfOneVisualNameBecomeTheSamePath() {
        String precomposed = "src/caf\u00E9.ts";
        String combining = "src/cafe\u0301.ts";

        assertThat(GeneratedPath.normalize(combining)).isEqualTo(GeneratedPath.normalize(precomposed));
    }
}
