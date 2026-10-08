package com.singularity.workspace.util;

import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.util.PreviewFailureExplainer.Explained;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the sentence and the cause a failed start is given, on the output npm and Vite really print.
 *
 * <p>Handles: a package that does not exist, named from either line npm reports it on; a version that does not; two
 * packages that cannot agree; a package.json that is not JSON; the registry or the disk failing, which must come out
 * as the platform's failure so the browser tries again instead of blaming the project; a dev server with no dev
 * script, a broken config or a missing module; and output it does not recognise, which keeps the general sentence.
 *
 * <p>The npm samples use both prefixes - "npm ERR!" before npm 10 and "npm error" since - because the runner image's
 * npm has changed under this once already.
 */
class PreviewFailureExplainerTest {

    @Test
    void aPackageThatDoesNotExistIsNamed() {
        Explained why = PreviewFailureExplainer.install("""
                $ npm install
                npm error code E404
                npm error 404 Not Found - GET https://registry.npmjs.org/react-fancy-thing-that-is-not-real - Not found
                npm error 404
                npm error 404  'react-fancy-thing-that-is-not-real@^1.0.0' is not in this registry.
                """);

        assertThat(why.kind()).isEqualTo(PreviewFailureKind.INSTALL);
        assertThat(why.detail()).isEqualTo(
                "The package \"react-fancy-thing-that-is-not-real\" doesn't exist on npm - check its name in package.json.");
    }

    @Test
    void aScopedPackageIsNamedWhole() {
        Explained fromQuotedLine = PreviewFailureExplainer.install(
                "npm ERR! code E404\nnpm ERR! 404  '@acme/not-real@1.2.3' is not in this registry.\n");
        Explained fromUrlOnly = PreviewFailureExplainer.install(
                "npm error code E404\nnpm error 404 Not Found - GET https://registry.npmjs.org/@acme%2fnot-real - Not found\n");

        assertThat(fromQuotedLine.detail()).contains("\"@acme/not-real\"");
        assertThat(fromUrlOnly.detail()).contains("\"@acme/not-real\"");
    }

    @Test
    void aVersionThatDoesNotExistNamesThePackageAndTheVersion() {
        Explained why = PreviewFailureExplainer.install("""
                npm error code ETARGET
                npm error notarget No matching version found for react@^99.0.0.
                npm error notarget In most cases you or one of your dependencies are requesting
                """);

        assertThat(why.kind()).isEqualTo(PreviewFailureKind.INSTALL);
        assertThat(why.detail()).isEqualTo(
                "There is no version of \"react\" matching \"^99.0.0\" - check its version in package.json.");
    }

    @Test
    void packagesThatCannotAgreeAndABrokenPackageJsonAreTheProjects() {
        assertThat(PreviewFailureExplainer.install("npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree"))
                .extracting(Explained::kind, Explained::detail)
                .containsExactly(PreviewFailureKind.INSTALL,
                        "Two packages in package.json need versions of the same package that don't fit together.");
        assertThat(PreviewFailureExplainer.install("npm error code EJSONPARSE\nnpm error JSON.parse Unexpected token"))
                .extracting(Explained::kind, Explained::detail)
                .containsExactly(PreviewFailureKind.INSTALL, "package.json isn't valid JSON - look for a missing comma or quote.");
    }

    @Test
    void theRegistryOrTheDiskFailingIsThePlatformsFailureNotTheProjects() {
        assertThat(PreviewFailureExplainer.install("npm error code ENOTFOUND\nnpm error network request to https://registry.npmjs.org/react failed").kind())
                .isEqualTo(PreviewFailureKind.PLATFORM);
        assertThat(PreviewFailureExplainer.install("npm error code ECONNRESET").kind()).isEqualTo(PreviewFailureKind.PLATFORM);
        assertThat(PreviewFailureExplainer.install("npm error code E503").kind()).isEqualTo(PreviewFailureKind.PLATFORM);
        assertThat(PreviewFailureExplainer.install("npm error code ENOSPC\nnpm error nospc ENOSPC: no space left on device").kind())
                .isEqualTo(PreviewFailureKind.PLATFORM);
        assertThat(PreviewFailureExplainer.install("npm warn tar TAR_ENTRY_ERROR ENOSPC: no space left on device, write").kind())
                .isEqualTo(PreviewFailureKind.PLATFORM);
    }

    @Test
    void anInstallFailureItDoesNotRecogniseKeepsTheGeneralSentence() {
        assertThat(PreviewFailureExplainer.install("something npm has never printed before"))
                .extracting(Explained::kind, Explained::detail)
                .containsExactly(PreviewFailureKind.INSTALL, "npm install failed - check package.json.");
        assertThat(PreviewFailureExplainer.install(null).kind()).isEqualTo(PreviewFailureKind.INSTALL);
    }

    @Test
    void aDevServerWithNoDevScriptOrNoViteSaysSo() {
        assertThat(PreviewFailureExplainer.devServer("$ npm run dev\nnpm error Missing script: \"dev\"\n").detail())
                .isEqualTo("package.json has no \"dev\" script, so there is nothing to start the app with.");
        assertThat(PreviewFailureExplainer.devServer("$ npm run dev\n\n> app@0.0.0 dev\n> vite\n\nsh: vite: not found\n").detail())
                .isEqualTo("Vite isn't installed - package.json no longer lists it.");
    }

    @Test
    void aBrokenConfigFileIsNamed() {
        Explained why = PreviewFailureExplainer.devServer("""
                $ npm run dev
                failed to load config from /app/vite.config.ts
                error when starting dev server:
                Error: Build failed with 1 error:
                """);

        assertThat(why.kind()).isEqualTo(PreviewFailureKind.DEV_SERVER);
        assertThat(why.detail()).isEqualTo("vite.config.ts has an error, so the dev server couldn't start.");
    }

    @Test
    void aMissingModuleIsNamedButAFileOfTheProjectsOwnIsNot() {
        assertThat(PreviewFailureExplainer.devServer("$ npm run dev\nError: Cannot find module 'tailwindcss'\nRequire stack:").detail())
                .isEqualTo("The dev server needs \"tailwindcss\", which isn't installed - add it to package.json.");
        assertThat(PreviewFailureExplainer.devServer("$ npm run dev\nError: Cannot find module './plugins/mine.js'").detail())
                .isEqualTo("The dev server stopped while starting.");
    }

    @Test
    void onlyTheDevServersOwnOutputIsRead() {
        Explained why = PreviewFailureExplainer.devServer("""
                $ npm install
                npm warn something mentions Cannot find module 'left-pad' in passing

                $ npm run dev
                Error: something else entirely
                """);

        assertThat(why.detail()).isEqualTo("The dev server stopped while starting.");
    }

    @Test
    void aPortStillTakenIsThePlatformsFailure() {
        assertThat(PreviewFailureExplainer.devServer("$ npm run dev\nError: Port 5173 is already in use").kind())
                .isEqualTo(PreviewFailureKind.PLATFORM);
    }

    @Test
    void aNameTakenFromTheOutputIsClippedAndCannotCarryQuotesOrControlCharacters() {
        String hostile = "a".repeat(200) + "\"\u0007";
        Explained why = PreviewFailureExplainer.devServer("$ npm run dev\nError: Cannot find module '" + hostile + "'");

        assertThat(why.detail()).doesNotContain("\u0007").hasSizeLessThan(200);
        assertThat(why.detail().chars().filter(c -> c == '"').count()).isEqualTo(2);
    }
}
