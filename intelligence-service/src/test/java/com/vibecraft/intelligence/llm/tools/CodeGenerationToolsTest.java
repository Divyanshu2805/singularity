package com.vibecraft.intelligence.llm.tools;

import com.vibecraft.common.dto.FileContentDto;
import com.vibecraft.intelligence.service.ProjectFileReader;
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
}
