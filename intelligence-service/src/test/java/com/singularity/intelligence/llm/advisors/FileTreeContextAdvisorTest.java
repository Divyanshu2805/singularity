package com.singularity.intelligence.llm.advisors;

import com.singularity.common.dto.FileTreeDto;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers how the project's file list is written into the prompt: plain paths the model can copy, one per line and in
 * a stable order, rather than a Java list's own text.
 */
class FileTreeContextAdvisorTest {

    @Test
    @DisplayName("the tree is one path per line, sorted, with no record syntax")
    void pathsOnePerLineSorted() {
        String tree = FileTreeContextAdvisor.describe(List.of(
                new FileTreeDto.Entry("src/main.tsx", 120, "text/plain"),
                new FileTreeDto.Entry("package.json", 900, "application/json"),
                new FileTreeDto.Entry("src/App.tsx", 400, "text/plain")));

        assertThat(tree).isEqualTo("package.json\nsrc/App.tsx\nsrc/main.tsx");
    }

    @Test
    @DisplayName("an empty project says so instead of printing an empty list")
    void anEmptyProjectSaysSo() {
        assertThat(FileTreeContextAdvisor.describe(List.of())).isEqualTo("(the project has no files yet)");
    }
}
