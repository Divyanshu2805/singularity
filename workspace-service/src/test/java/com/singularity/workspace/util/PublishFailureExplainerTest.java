package com.singularity.workspace.util;

import com.singularity.workspace.enums.PublishFailureKind;
import com.singularity.workspace.util.PublishFailureExplainer.Explained;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The plain sentences a failed publish is explained with, and - as important - which failures are the project's and
 * which the platform's, since only the second is worth trying again unchanged.
 */
class PublishFailureExplainerTest {

    @Test
    @DisplayName("a package that does not exist is the project's, with its name in the sentence")
    void missingPackage() {
        Explained why = PublishFailureExplainer.install(
                "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/not-a-real-pkg-xyz - Not found");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.INSTALL);
        assertThat(why.detail()).contains("not-a-real-pkg-xyz");
    }

    @Test
    @DisplayName("a registry that could not be reached is the platform's, not the project's")
    void registryUnreachable() {
        Explained why = PublishFailureExplainer.install("npm error code ETIMEDOUT\nnpm error network request failed");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.PLATFORM);
    }

    @Test
    @DisplayName("a full disk during install is the platform's")
    void diskFull() {
        assertThat(PublishFailureExplainer.install("npm error code ENOSPC").kind()).isEqualTo(PublishFailureKind.PLATFORM);
    }

    @Test
    @DisplayName("an install that fails for no known reason is the project's")
    void unknownInstall() {
        Explained why = PublishFailureExplainer.install("something odd");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.INSTALL);
        assertThat(why.detail()).contains("npm install failed");
    }

    @Test
    @DisplayName("a project with no build script is told so")
    void noBuildScript() {
        Explained why = PublishFailureExplainer.build("npm error Missing script: \"build\"");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(why.detail()).contains("no \"build\" script");
    }

    @Test
    @DisplayName("an import that cannot be found names both the import and the file")
    void unresolvedImport() {
        Explained why = PublishFailureExplainer.build(
                "error during build:\nRollup failed to resolve import \"./components/Missing\" from \"/app/src/App.tsx\".");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(why.detail()).contains("./components/Missing").contains("/app/src/App.tsx");
    }

    @Test
    @DisplayName("a TypeScript error names the file, the line and the message")
    void typeScriptError() {
        Explained why = PublishFailureExplainer.build(
                "src/pages/Index.tsx(14,5): error TS2322: Type 'string' is not assignable to type 'number'.");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(why.detail()).contains("src/pages/Index.tsx").contains("line 14").contains("not assignable");
    }

    @Test
    @DisplayName("a syntax error names the file when the bundler does")
    void syntaxError() {
        Explained why = PublishFailureExplainer.build(
                "Transform failed with 1 error:\nfile: /app/src/App.tsx:10:4\nERROR: Unexpected \"}\"");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(why.detail()).contains("/app/src/App.tsx").contains("Unexpected");
    }

    @Test
    @DisplayName("a build killed for memory is reported as too large, not as a mistake in the code")
    void outOfMemory() {
        assertThat(PublishFailureExplainer.build("FATAL ERROR: JavaScript heap out of memory").kind())
                .isEqualTo(PublishFailureKind.TOO_LARGE);
    }

    @Test
    @DisplayName("a build that ran out of time says so")
    void timedOut() {
        assertThat(PublishFailureExplainer.build("vite building...\n(timed out after 240s)").kind())
                .isEqualTo(PublishFailureKind.TIMEOUT);
    }

    @Test
    @DisplayName("anything else gets the general sentence")
    void general() {
        Explained why = PublishFailureExplainer.build("nothing recognisable here");

        assertThat(why.kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(why.detail()).contains("The build failed");
    }

    @Test
    @DisplayName("names taken from the tools' output are cleaned and cut short, never trusted")
    void namesAreCleaned() {
        String hostile = "x".repeat(300) + "\u0007\u001b[31m";
        Explained why = PublishFailureExplainer.build("Rollup failed to resolve import \"" + hostile + "\" from \"a.tsx\"");

        assertThat(why.detail()).doesNotContain("\u0007").hasSizeLessThan(400);
    }

    @Test
    @DisplayName("null output does not break it")
    void nullOutput() {
        assertThat(PublishFailureExplainer.build(null).kind()).isEqualTo(PublishFailureKind.BUILD);
        assertThat(PublishFailureExplainer.install(null).kind()).isEqualTo(PublishFailureKind.INSTALL);
    }
}
