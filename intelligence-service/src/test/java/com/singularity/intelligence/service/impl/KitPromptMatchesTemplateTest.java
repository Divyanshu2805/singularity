package com.singularity.intelligence.service.impl;

import com.singularity.intelligence.llm.ProjectBrief;
import com.singularity.intelligence.llm.PromptUtils;
import com.singularity.intelligence.llm.UiKit;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Holds the build prompt to the starter template that ships in workspace-service.
 *
 * <p>The prompt tells the model which components exist and that it need not read them, and the two live in different
 * modules. A component added to the template and not to the prompt is one the model never uses; one named in the
 * prompt and missing from the template is an import that breaks every app that follows the prompt. So this reads the
 * real template off disk and checks both directions, and that a project fresh from the template is recognised as the
 * kit the prompt describes and shown to the model whole without the kit's own files.
 */
class KitPromptMatchesTemplateTest {

    private final ScratchProject template = ScratchProject.fromStarterTemplate();

    private List<String> templateComponents() {
        return template.getFileTree(1L).entries().stream()
                .map(entry -> entry.path())
                .filter(path -> path.startsWith(UiKit.KIT_FOLDER))
                .map(path -> path.substring(UiKit.KIT_FOLDER.length()).replace(".tsx", ""))
                .sorted()
                .toList();
    }

    @Test
    void everyComponentTheTemplateShipsIsNamedInThePromptAndTheOtherWayRound() {
        String kit = PromptUtils.getSystemPrompt(UiKit.SHADCN);
        kit = kit.substring(kit.indexOf("## 8. The UI kit"), kit.indexOf("## 9. Code"));

        Matcher named = Pattern.compile("(?m)(?:^- |\\.  )([a-z][a-z-]*): [A-Z]").matcher(kit);
        List<String> inThePrompt = new java.util.ArrayList<>();
        while (named.find()) {
            inThePrompt.add(named.group(1));
        }
        Matcher alsoNamed = Pattern.compile(", and ([a-z][a-z-]*): [A-Z]").matcher(kit);
        while (alsoNamed.find()) {
            inThePrompt.add(alsoNamed.group(1));
        }

        assertThat(inThePrompt.stream().sorted().toList()).isEqualTo(templateComponents());
    }

    @Test
    void theHelpersThePromptNamesAreInTheTemplate() {
        assertThat(template.content("src/lib/utils.ts")).contains("export function cn(");
        assertThat(template.content("src/App.tsx")).contains("<TooltipProvider>").contains("<Toaster");
        assertThat(template.content("src/index.css")).contains("--font-display").contains(".dark {")
                .contains("--color-success").contains("--color-chart-5");
        assertThat(template.content("package.json")).contains("\"sonner\"").contains("\"lucide-react\"");
    }

    @Test
    void whatThePromptSaysAServerNeedsIsAlreadyInTheTemplateAndShownToTheModel() {
        assertThat(template.content("package.json")).contains("\"express\"").contains("\"tsx\"")
                .contains("\"@types/express\"").contains("\"server\": \"tsx watch server/index.ts\"")
                .contains("\"start\": \"node start.mjs\"").contains("\"dev:all\"").contains("\"node\": \">=22.13\"");
        assertThat(template.content("package.json").indexOf("\"tsx\"")).as("tsx is needed to run the hosted app, so it is not a dev dependency")
                .isLessThan(template.content("package.json").indexOf("\"devDependencies\""));
        assertThat(template.content("vite.config.js")).contains("\"/api\": \"http://127.0.0.1:3001\"");
        assertThat(template.content("tsconfig.json")).contains("\"include\": [\"src\", \"server\"]");

        assertThat(template.content("start.mjs")).contains("\"--import\", \"tsx\", \"server/index.ts\"")
                .contains("const apiPort = port === 3001 ? 3002 : 3001;");

        ProjectBrief brief = ProjectBrief.of(template.getFileTree(1L).entries(), template::content, null);
        assertThat(brief.shownPaths()).contains("package.json", "vite.config.js", "tsconfig.json").doesNotContain("start.mjs");
        assertThat(brief.text()).contains("start.mjs runs the built app on a host");
    }

    @Test
    void aProjectFreshFromTheTemplateIsTheKitThePromptDescribesAndIsShownWholeWithoutTheKitsFiles() {
        ProjectBrief brief = ProjectBrief.of(template.getFileTree(1L).entries(), template::content, null);

        assertThat(brief.kit()).isEqualTo(UiKit.SHADCN);
        assertThat(brief.showsEverySourceFile()).isTrue();
        assertThat(brief.shownPaths()).contains("src/index.css", "src/App.tsx", "src/lib/utils.ts", "package.json")
                .noneMatch(path -> path.startsWith(UiKit.KIT_FOLDER));
        assertThat(brief.text().length()).isLessThan(12_000);
    }
}
