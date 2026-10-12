package com.singularity.workspace.util;

import com.singularity.workspace.util.ProjectHandout.Extra;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests for {@link ProjectHandout}, which writes the README and .gitignore a project is given as it leaves the
 * workspace.
 *
 * <p>Handles: a project that has neither file getting both and one that has its own keeping them, however the name
 * is cased; the README telling a project with a server how to run both halves and how to host it, and a project
 * without one that it is a set of files; and the README never naming a command the project's package.json does not
 * have, since the first command that fails is where a beginner stops.
 */
class ProjectHandoutTest {

    private static final String NEW_SCRIPTS = "{\"scripts\":{\"dev\":\"vite\",\"server\":\"tsx watch server/index.ts\","
            + "\"dev:all\":\"concurrently\",\"start\":\"tsx server/index.ts\"}}";

    private static String readmeOf(List<Extra> extras) {
        return extras.stream().filter(extra -> extra.path().equals("README.md")).findFirst().orElseThrow().content();
    }

    @Test
    void aProjectWithNeitherFileIsGivenBoth() {
        List<Extra> extras = ProjectHandout.extrasFor("Todo", List.of("package.json", "src/App.tsx"), NEW_SCRIPTS);

        assertThat(extras).extracting(Extra::path).containsExactly("README.md", ".gitignore");
        assertThat(extras.get(1).content()).contains("node_modules\n").contains("dist\n").contains(".data\n").contains(".env\n");
    }

    @Test
    void aProjectsOwnFilesAreKeptHoweverTheyAreSpelled() {
        assertThat(ProjectHandout.extrasFor("Todo", List.of("readme.md", ".gitignore"), null)).isEmpty();
        assertThat(ProjectHandout.extrasFor("Todo", List.of("README", "src/App.tsx"), null))
                .extracting(Extra::path).containsExactly(".gitignore");
        assertThat(ProjectHandout.extrasFor("Todo", List.of("docs/README.md"), null))
                .extracting(Extra::path).containsExactly("README.md", ".gitignore");
    }

    @Test
    void aProjectWithAServerIsToldHowToRunBothHalvesAndHowToHostIt() {
        String readme = readmeOf(ProjectHandout.extrasFor("Noughts",
                List.of("package.json", "start.mjs", "server/index.ts", "server/db.ts"), NEW_SCRIPTS));

        assertThat(readme).startsWith("# Noughts\n")
                .contains("`server/` - the app's own server")
                .contains("`start.mjs` - runs the finished app as one program")
                .contains("`start.mjs` reads it")
                .contains("version 22 or newer")
                .contains("npm run dev:all")
                .contains("Build command: `npm install --include=dev && npm run build`")
                .contains("Start command: `npm start`")
                .contains("A free plan does not keep files")
                .contains("The host picks the port")
                .doesNotContain("press Publish in Singularity");
    }

    @Test
    void aProjectWithNoServerIsToldItIsASetOfFiles() {
        String readme = readmeOf(ProjectHandout.extrasFor("Timer", List.of("package.json", "src/App.tsx"), NEW_SCRIPTS));

        assertThat(readme).contains("npm run dev\n").contains("This app has no server").contains("press Publish in Singularity")
                .contains("upload the `dist` folder")
                .doesNotContain("dev:all").doesNotContain("npm start").doesNotContain("server/");
    }

    @Test
    void aCommandThePackageFileDoesNotHaveIsNeverNamed() {
        String oldProject = ProjectHandout.readme("Old", true, false, Set.of("dev", "build"));
        assertThat(oldProject).contains("npx tsx watch server/index.ts")
                .doesNotContain("dev:all").doesNotContain("npm start").doesNotContain("npm run server");

        String halfway = ProjectHandout.readme("Half", true, false, Set.of("dev", "server"));
        assertThat(halfway).contains("npm run server").contains("in a second terminal");
    }

    @Test
    void aServerProjectWithoutTheLauncherIsToldItCannotBeHostedAsOneProgramAndGivenNoStepsThatWouldFail() {
        String withoutLauncher = ProjectHandout.readme("Old", true, false, Set.of("dev", "server", "start"));
        String withoutScript = ProjectHandout.readme("Old", true, true, Set.of("dev", "server"));

        for (String readme : List.of(withoutLauncher, withoutScript)) {
            assertThat(readme).contains("made before projects here could run as one program on a host")
                    .contains("npx tsx server/index.ts")
                    .doesNotContain("Start command").doesNotContain("Render");
        }
    }

    @Test
    void aPackageFileThatCannotBeReadMeansNoScriptsAreAssumed() {
        assertThat(ProjectHandout.scriptsOf("not json")).isEmpty();
        assertThat(ProjectHandout.scriptsOf(null)).isEmpty();
        assertThat(ProjectHandout.scriptsOf("{\"scripts\":[]}")).isEmpty();
        assertThat(ProjectHandout.scriptsOf(NEW_SCRIPTS)).contains("dev:all", "start");
    }

    @Test
    void aNameWithALineBreakCannotStartAHeadingOfItsOwn() {
        assertThat(ProjectHandout.readme("One\n# Two", false, false, Set.of())).startsWith("# One # Two\n\n");
        assertThat(ProjectHandout.readme(" ", false, false, Set.of())).startsWith("# This app\n");
    }
}
