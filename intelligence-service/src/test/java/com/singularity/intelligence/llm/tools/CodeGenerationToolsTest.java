package com.singularity.intelligence.llm.tools;

import com.singularity.common.dto.FileContentDto;
import com.singularity.intelligence.service.ProjectFileReader;
import feign.FeignException;
import feign.Request;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers the two guards added after a production turn made 21 {@code read_files} calls re-reading the same two
 * files and never wrote a fix (875k tokens for a no-op): a path already returned in full this turn must not be
 * re-fetched or re-sent in full, and a turn making too many calls without converging must be cut off rather than
 * left to loop indefinitely.
 *
 * <p>Also covers what the tool tells its caller: the files it actually fetched, which is how a build turn shows and
 * records a read without the model having to announce it. And two things about what it tells the model: a file the
 * build turn already showed it is answered with a pointer, and a refusal never names the writing protocol - this tool
 * is the code lens's too, and that path must never learn the tags that write files.
 */
class CodeGenerationToolsTest {

    private static final Long PROJECT_ID = 1L;

    private final ProjectFileReader projectFileReader = mock(ProjectFileReader.class);
    private final CodeGenerationTools tools = new CodeGenerationTools(projectFileReader, PROJECT_ID);

    @Test
    void reReadingTheSamePathWithinATurnReturnsAPointerInsteadOfFetchingItAgain() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), eq("src/App.tsx")))
                .thenReturn(new FileContentDto("src/App.tsx", "export default function App() {}"));

        List<String> first = tools.readFiles(List.of("src/App.tsx"));
        List<String> second = tools.readFiles(List.of("src/App.tsx"));

        assertThat(first.getFirst()).contains("START OF FILE").contains("export default function App");
        assertThat(second.getFirst()).contains("ALREADY READ").doesNotContain("export default function App");
        verify(projectFileReader, times(1)).getFileContent(eq(PROJECT_ID), eq("src/App.tsx"));
    }

    @Test
    void aTurnThatKeepsCallingPastTheCapIsRefusedInsteadOfFetchingForever() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));

        for (int call = 1; call <= CodeGenerationTools.MAX_CALLS; call++) {
            List<String> result = tools.readFiles(List.of("file" + call + ".ts"));
            assertThat(result.getFirst()).contains("START OF FILE");
        }

        List<String> overLimit = tools.readFiles(List.of("one-more.ts"));

        assertThat(overLimit.getFirst()).contains("READ LIMIT REACHED");
        verify(projectFileReader, times(0)).getFileContent(eq(PROJECT_ID), eq("one-more.ts"));
    }

    @Test
    void reReadingAFileThatWasNotFoundStillStopsAtThePointerRatherThanAskingAgain() {
        Request request = Request.create(Request.HttpMethod.GET, "/files/missing.ts", Map.of(), null, StandardCharsets.UTF_8);
        when(projectFileReader.getFileContent(eq(PROJECT_ID), eq("missing.ts")))
                .thenThrow(new FeignException.NotFound("not found", request, null, Map.of()));

        tools.readFiles(List.of("missing.ts"));
        List<String> second = tools.readFiles(List.of("missing.ts"));

        assertThat(second.getFirst()).contains("ALREADY READ");
        verify(projectFileReader, times(1)).getFileContent(eq(PROJECT_ID), eq("missing.ts"));
    }

    @Test
    void theCallerIsToldWhichFilesWereActuallyFetchedNotOnesAlreadyReadOrRefused() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        java.util.List<List<String>> reads = new java.util.ArrayList<>();
        CodeGenerationTools reporting = new CodeGenerationTools(projectFileReader, PROJECT_ID, reads::add);

        reporting.readFiles(List.of("./src/App.tsx", "/src/main.tsx"));
        reporting.readFiles(List.of("src/App.tsx", "src/index.css"));

        assertThat(reads).containsExactly(List.of("src/App.tsx", "src/main.tsx"), List.of("src/index.css"));
    }

    @Test
    void aReadRefusedForBeingOverTheCapIsNotReportedAsARead() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        java.util.List<List<String>> reads = new java.util.ArrayList<>();
        CodeGenerationTools reporting = new CodeGenerationTools(projectFileReader, PROJECT_ID, reads::add);

        for (int call = 1; call <= CodeGenerationTools.MAX_CALLS + 1; call++) {
            reporting.readFiles(List.of("file" + call + ".ts"));
        }

        assertThat(reads).hasSize(CodeGenerationTools.MAX_CALLS);
    }

    @Test
    void aFileAlreadyShownWithThePromptIsAnsweredWithAPointerAndNeverFetchedOrReportedAsRead() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        java.util.List<List<String>> reads = new java.util.ArrayList<>();
        CodeGenerationTools shown = new CodeGenerationTools(projectFileReader, PROJECT_ID,
                java.util.Set.of("src/App.tsx", "package.json"), null, reads::add);

        List<String> result = shown.readFiles(List.of("./src/App.tsx", "src/components/Nav.tsx", "package.json"));

        assertThat(result.get(0)).contains("ALREADY SHOWN: src/App.tsx").contains("under FILES").doesNotContain("START OF FILE");
        assertThat(result.get(1)).contains("START OF FILE: src/components/Nav.tsx");
        assertThat(result.get(2)).contains("ALREADY SHOWN: package.json");
        assertThat(reads).containsExactly(List.of("src/components/Nav.tsx"));
        verify(projectFileReader, times(0)).getFileContent(eq(PROJECT_ID), eq("src/App.tsx"));
        verify(projectFileReader, times(0)).getFileContent(eq(PROJECT_ID), eq("package.json"));
    }

    @Test
    void aBuildTurnsNoteEndsEveryAnswerSoItIsTheLastThingTheModelReads() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        CodeGenerationTools noted = new CodeGenerationTools(projectFileReader, PROJECT_ID,
                java.util.Set.of("package.json"), "REMINDER: answer in the output format.", paths -> { });

        List<String> result = noted.readFiles(List.of("src/a.ts", "src/b.ts"));

        assertThat(result).hasSize(3);
        assertThat(result.getLast()).isEqualTo("REMINDER: answer in the output format.");
        assertThat(tools.readFiles(List.of("src/a.ts"))).hasSize(1);
    }

    @Test
    void aTurnThatWasShownFilesIsAllowedFewerCallsBeforeItIsRefused() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        CodeGenerationTools shown = new CodeGenerationTools(projectFileReader, PROJECT_ID,
                java.util.Set.of("package.json"), null, paths -> { });

        for (int call = 1; call <= CodeGenerationTools.MAX_CALLS_WHEN_FILES_WERE_SHOWN; call++) {
            assertThat(shown.readFiles(List.of("file" + call + ".ts")).getFirst()).contains("START OF FILE");
        }

        assertThat(shown.readFiles(List.of("one-more.ts")).getFirst()).contains("READ LIMIT REACHED");
        assertThat(CodeGenerationTools.MAX_CALLS_WHEN_FILES_WERE_SHOWN).isLessThan(CodeGenerationTools.MAX_CALLS);
    }

    @Test
    void whatTheToolSaysWhenItRefusesNeverNamesTheWritingProtocol() {
        when(projectFileReader.getFileContent(eq(PROJECT_ID), any()))
                .thenAnswer(inv -> new FileContentDto(inv.getArgument(1), "content"));
        for (int call = 1; call <= CodeGenerationTools.MAX_CALLS; call++) {
            tools.readFiles(List.of("file" + call + ".ts"));
        }

        String refusal = tools.readFiles(List.of("one-more.ts")).getFirst();

        assertThat(refusal).contains("Do not call read_files again").contains("output format you were given");
        assertThat(refusal).doesNotContain("<file").doesNotContain("<todo").doesNotContain("<message").doesNotContain("<learn");
    }

    @Test
    void theCodeLensStillHearsAboutEveryInvocationEvenOneWithNothingToRead() {
        java.util.concurrent.atomic.AtomicInteger invocations = new java.util.concurrent.atomic.AtomicInteger();
        Runnable onInvoke = invocations::incrementAndGet;
        CodeGenerationTools lens = new CodeGenerationTools(projectFileReader, PROJECT_ID, onInvoke);

        lens.readFiles(List.of());
        lens.readFiles(List.of("src/App.tsx"));

        assertThat(invocations).hasValue(2);
    }
}
