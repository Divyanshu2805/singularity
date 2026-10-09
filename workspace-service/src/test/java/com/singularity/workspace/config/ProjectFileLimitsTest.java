package com.singularity.workspace.config;

import com.singularity.common.dto.FileChangeDto;
import com.singularity.workspace.entity.ProjectFile;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The limits on how large a project may grow.
 *
 * <p>Handles: a change inside every limit passes; one file over the per-file limit is refused by name; a change that
 * takes the file count or the total size past its limit is refused; rewriting an existing file counts its new size
 * and not both; a delete makes room; and a project already over a limit can still be edited or shrunk, only not
 * grown.
 */
class ProjectFileLimitsTest {

    private final ProjectFileLimits limits = new ProjectFileLimits(3, 100, 250);

    private static ProjectFile file(String path, long size) {
        return ProjectFile.builder().path(path).size(size).build();
    }

    private static FileChangeDto write(String path, int bytes) {
        return new FileChangeDto(path, FileChangeDto.ChangeType.EDIT, "x".repeat(bytes));
    }

    private static FileChangeDto delete(String path) {
        return new FileChangeDto(path, FileChangeDto.ChangeType.DELETE, null);
    }

    @Test
    void aChangeInsideEveryLimitPasses() {
        assertThat(limits.exceededBy(List.of(file("src/a.ts", 50)), List.of(write("src/b.ts", 60)))).isEmpty();
    }

    @Test
    void oneFileOverThePerFileLimitIsRefusedByName() {
        assertThat(limits.exceededBy(List.of(), List.of(write("src/big.ts", 101))))
                .hasValueSatisfying(reason -> assertThat(reason).contains("src/big.ts").contains("Nothing was saved"));
    }

    @Test
    void aChangeThatTakesTheProjectPastItsFileCountIsRefused() {
        List<ProjectFile> current = List.of(file("a.ts", 1), file("b.ts", 1), file("c.ts", 1));

        assertThat(limits.exceededBy(current, List.of(write("d.ts", 1))))
                .hasValueSatisfying(reason -> assertThat(reason).contains("4 files").contains("at most 3"));
    }

    @Test
    void aChangeThatTakesTheProjectPastItsTotalSizeIsRefused() {
        List<ProjectFile> current = List.of(file("a.ts", 100), file("b.ts", 100));

        assertThat(limits.exceededBy(current, List.of(write("c.ts", 60)))).isPresent();
    }

    @Test
    void rewritingAFileCountsItsNewSizeAndNotBoth() {
        List<ProjectFile> current = List.of(file("a.ts", 100), file("b.ts", 100));

        assertThat(limits.exceededBy(current, List.of(write("a.ts", 90)))).isEmpty();
    }

    @Test
    void aDeleteInTheSameChangeMakesRoom() {
        List<ProjectFile> current = List.of(file("a.ts", 1), file("b.ts", 1), file("c.ts", 1));

        assertThat(limits.exceededBy(current, List.of(delete("a.ts"), write("d.ts", 1)))).isEmpty();
    }

    @Test
    void aProjectAlreadyOverALimitCanBeEditedOrShrunkButNotGrown() {
        List<ProjectFile> current = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            current.add(file("f" + i + ".ts", 10));
        }

        assertThat(limits.exceededBy(current, List.of(write("f0.ts", 20)))).isEmpty();
        assertThat(limits.exceededBy(current, List.of(delete("f0.ts")))).isEmpty();
        assertThat(limits.exceededBy(current, List.of(write("new.ts", 1)))).isPresent();
    }

    @Test
    void sizesAreSaidInWordsAPersonReads() {
        assertThat(ProjectFileLimits.readable(2 * 1024 * 1024)).isEqualTo("2.0 MB");
        assertThat(ProjectFileLimits.readable(51_200)).isEqualTo("50 KB");
        assertThat(ProjectFileLimits.readable(10)).isEqualTo("1 KB");
    }
}
