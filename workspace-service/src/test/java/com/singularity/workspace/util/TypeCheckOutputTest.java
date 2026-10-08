package com.singularity.workspace.util;

import com.singularity.common.dto.CodeCheckResponse.Problem;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers reading the TypeScript compiler's output into problems a build turn can be asked to repair.
 *
 * <p>The output below is what {@code tsc --pretty false} prints. The cases are the ones that decide whether the check
 * helps or harms: an error in a file the turn wrote is reported with its place; an error in a file it did not touch
 * is left alone, or every turn would be asked to mend the project's old faults; a message that runs over several
 * lines is kept whole; and "cannot find module" for a package the turn has only just added is not an error at all,
 * since nothing has installed it yet.
 */
class TypeCheckOutputTest {

    private static final String OUTPUT = """
            src/components/TaskList.tsx(12,9): error TS2322: Type 'string' is not assignable to type 'number'.
            src/pages/Index.tsx(4,22): error TS2307: Cannot find module 'canvas-confetti' or its corresponding type declarations.
            src/pages/Index.tsx(30,14): error TS2741: Property 'onRemove' is missing in type '{ tasks: Task[]; }' but required in type 'TaskListProps'.
              Overload 1 of 2, '(props: TaskListProps): Element', gave the following error.
            src/legacy/Old.tsx(3,1): error TS2304: Cannot find name 'foo'.
            Found 4 errors in 3 files.
            """;

    @Test
    void anErrorIsReadWithItsFileLineColumnCodeAndMessage() {
        List<Problem> problems = TypeCheckOutput.parse(OUTPUT);

        assertThat(problems).hasSize(4);
        assertThat(problems.getFirst()).isEqualTo(new Problem("src/components/TaskList.tsx", 12, 9, "TS2322",
                "Type 'string' is not assignable to type 'number'."));
    }

    @Test
    void theIndentedLinesUnderAnErrorArePartOfItsMessage() {
        Problem problem = TypeCheckOutput.parse(OUTPUT).get(2);

        assertThat(problem.line()).isEqualTo(30);
        assertThat(problem.message()).startsWith("Property 'onRemove' is missing").endsWith("gave the following error.");
    }

    @Test
    void onlyErrorsInTheFilesTheTurnWroteAreReported() {
        List<Problem> problems = TypeCheckOutput.problems(OUTPUT, Set.of("src/components/TaskList.tsx"), Set.of(), 10);

        assertThat(problems).extracting(Problem::path).containsExactly("src/components/TaskList.tsx");
    }

    @Test
    void aPackageTheTurnHasJustAddedIsNotReportedAsMissing() {
        List<Problem> problems = TypeCheckOutput.problems(OUTPUT, Set.of("src/pages/Index.tsx"), Set.of("canvas-confetti"), 10);

        assertThat(problems).extracting(Problem::code).containsExactly("TS2741");
    }

    @Test
    void aPackageThatWasNotAddedIsStillReportedAsMissing() {
        List<Problem> problems = TypeCheckOutput.problems(OUTPUT, Set.of("src/pages/Index.tsx"), Set.of("zod"), 10);

        assertThat(problems).extracting(Problem::code).containsExactly("TS2307", "TS2741");
    }

    @Test
    void noMoreProblemsAreReportedThanTheLimit() {
        Set<String> everything = Set.of("src/components/TaskList.tsx", "src/pages/Index.tsx", "src/legacy/Old.tsx");

        assertThat(TypeCheckOutput.problems(OUTPUT, everything, Set.of(), 2)).hasSize(2);
    }

    @Test
    void theMissingPackageIsNamedByItsPackageNotByTheFileInsideIt() {
        assertThat(TypeCheckOutput.missingPackage("Cannot find module 'date-fns/locale' or its corresponding type declarations."))
                .contains("date-fns");
        assertThat(TypeCheckOutput.missingPackage("Cannot find module '@radix-ui/react-dialog/dist/x'.")).contains("@radix-ui/react-dialog");
        assertThat(TypeCheckOutput.missingPackage("Could not find a declaration file for module 'canvas-confetti'."))
                .contains("canvas-confetti");
        assertThat(TypeCheckOutput.missingPackage("Cannot find module './hooks/useTasks'.")).isEmpty();
        assertThat(TypeCheckOutput.missingPackage("Cannot find module '@/lib/utils'.")).isEmpty();
        assertThat(TypeCheckOutput.missingPackage("Type 'string' is not assignable to type 'number'.")).isEmpty();
    }

    @Test
    void outputWithNoErrorsOrNoOutputAtAllIsNoProblems() {
        assertThat(TypeCheckOutput.parse("")).isEmpty();
        assertThat(TypeCheckOutput.parse(null)).isEmpty();
        assertThat(TypeCheckOutput.parse("npm warn something unrelated\n")).isEmpty();
    }

    @Test
    void aWindowsStylePathIsReportedWithForwardSlashes() {
        assertThat(TypeCheckOutput.parse("src\\App.tsx(1,1): error TS1005: ';' expected.").getFirst().path())
                .isEqualTo("src/App.tsx");
    }
}
