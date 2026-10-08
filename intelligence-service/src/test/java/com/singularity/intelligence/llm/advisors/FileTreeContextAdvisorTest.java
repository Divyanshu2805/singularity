package com.singularity.intelligence.llm.advisors;

import com.singularity.common.dto.FileContentDto;
import com.singularity.common.dto.FileTreeDto;
import com.singularity.common.dto.ProjectSummaryDto;
import com.singularity.intelligence.feign.WorkspaceServiceClient;
import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.PromptUtils;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers describing a project from workspace-service: what is fetched, and that a file which cannot be read costs the
 * model that file and nothing more.
 *
 * <p>What the description says, and which files it chooses to show, is {@code ProjectBriefTest}'s. The text is still
 * checked here from end to end once, because the step that hands package.json to the model was at one point written
 * and tested without ever being called: the prompt told the model the file was shown below the tree and not to read
 * it, and it was not there.
 */
class FileTreeContextAdvisorTest {

    private final WorkspaceServiceClient workspaceServiceClient = mock(WorkspaceServiceClient.class);
    private final FileTreeContextAdvisor advisor = new FileTreeContextAdvisor(workspaceServiceClient);

    private void projectHas(FileTreeDto.Entry... entries) {
        when(workspaceServiceClient.getFileTree(1L)).thenReturn(new FileTreeDto(1L, List.of(entries)));
    }

    @Test
    @DisplayName("what the model is shown really holds the tree, package.json and the source files")
    void theModelIsShownTheTreeAndTheFilesTogether() {
        projectHas(new FileTreeDto.Entry("src/App.tsx", 60, "text/plain"),
                new FileTreeDto.Entry("package.json", 50, "application/json"),
                new FileTreeDto.Entry("public/logo.svg", 900, "image/svg+xml"));
        when(workspaceServiceClient.getFileContent(1L, "package.json"))
                .thenReturn(new FileContentDto("package.json", "{ \"dependencies\": { \"react\": \"^18.3.1\" } }\n"));
        when(workspaceServiceClient.getFileContent(1L, "src/App.tsx"))
                .thenReturn(new FileContentDto("src/App.tsx", "export default function App() { return null; }\n"));
        when(workspaceServiceClient.getProjectSummary(1L)).thenReturn(new ProjectSummaryDto(1L, "Todo", false, false, null));

        ProjectBrief brief = advisor.describe(1L);

        assertThat(brief.text()).contains("---- FILE_TREE ----\npackage.json\npublic/logo.svg\nsrc/App.tsx")
                .contains("--- START OF FILE: package.json ---\n{ \"dependencies\": { \"react\": \"^18.3.1\" } }\n--- END OF FILE ---")
                .contains("--- START OF FILE: src/App.tsx ---\nexport default function App() { return null; }\n--- END OF FILE ---")
                .doesNotContain("NOTICE");
        assertThat(brief.shownPaths()).containsExactlyInAnyOrder("package.json", "src/App.tsx");
        verify(workspaceServiceClient, never()).getFileContent(1L, "public/logo.svg");
    }

    @Test
    @DisplayName("a file that cannot be read is left out, and the project is still described")
    void aFailedReadIsNotFatal() {
        projectHas(new FileTreeDto.Entry("package.json", 50, "application/json"),
                new FileTreeDto.Entry("src/App.tsx", 60, "text/plain"));
        when(workspaceServiceClient.getFileContent(1L, "package.json")).thenThrow(new RuntimeException("timeout"));
        when(workspaceServiceClient.getFileContent(1L, "src/App.tsx"))
                .thenReturn(new FileContentDto("src/App.tsx", "export default 1;\n"));
        when(workspaceServiceClient.getProjectSummary(1L))
                .thenReturn(new ProjectSummaryDto(1L, "Todo", false, false, "index.html was not copied."));

        ProjectBrief brief = advisor.describe(1L);

        assertThat(brief.shownPaths()).containsExactly("src/App.tsx");
        assertThat(brief.showsEverySourceFile()).isFalse();
        assertThat(brief.text()).contains("Only the files above are shown");
        assertThat(brief.text()).contains("---- FILE_TREE ----\npackage.json\nsrc/App.tsx")
                .contains("---- NOTICE ----").contains("index.html was not copied.");
    }

    @Test
    @DisplayName("the format reminder is the last thing the model is given, after the project's files")
    void theContextClosesWithTheFormatReminder() {
        String context = FileTreeContextAdvisor.projectContext("\n\n ---- FILE_TREE ----\nsrc/App.tsx");

        assertThat(context).startsWith("\n\n ---- FILE_TREE ----\nsrc/App.tsx");
        assertThat(context).endsWith(PromptUtils.closingReminder());
        assertThat(context).contains("never write anything outside a tag");
        assertThat(context.indexOf("FILE_TREE")).isLessThan(context.indexOf("---- REMINDER ----"));
    }

    @Test
    @DisplayName("a project with no summary and no files is described without a read")
    void anEmptyProjectCostsNoRead() {
        projectHas();

        ProjectBrief brief = advisor.describe(1L);

        assertThat(brief.text()).contains("(the project has no files yet)");
        verify(workspaceServiceClient, never()).getFileContent(any(), any());
    }
}
