package com.singularity.workspace.service.impl;

import com.singularity.common.dto.CodeCheckRequest;
import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.common.dto.CodeCheckResponse.Problem;
import com.singularity.common.error.BadRequestException;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.config.CodeCheckProperties;
import com.singularity.workspace.dto.project.FileContentResponse;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Covers type-checking a build turn's files in the project's running preview.
 *
 * <p>Two things matter here and both are tested from each side. The check must find what it is for: a compiler
 * error in a file the turn wrote, a package that does not exist. And it must never get in a build's way: no
 * preview, a runner that has gone, a cluster that cannot be reached, a project with no TypeScript setup, a turn too
 * large, a check that outran its time - each must come back "not checked", never an error and never a false
 * problem. The rest pin where the files go - a scratch folder, never the preview's own copy - and that the scratch
 * folder is removed afterwards whatever happened.
 *
 * <p>The pod is a mock that answers by script, so nothing here needs a cluster. What a real compiler in a real pod
 * says about a real project is verified by hand (see the testing guide).
 */
class CodeCheckServiceImplTest {

    private static final long PROJECT_ID = 42L;
    private static final String POD = "runner-abc";
    private static final String PAGE = "src/pages/Index.tsx";

    private final PreviewRepository previewRepository = mock(PreviewRepository.class);
    private final PreviewRunnerPool runnerPool = mock(PreviewRunnerPool.class);
    private final ProjectFileService projectFileService = mock(ProjectFileService.class);
    private final List<String> scripts = new ArrayList<>();

    private CodeCheckServiceImpl service(CodeCheckProperties properties) {
        return new CodeCheckServiceImpl(previewRepository, runnerPool, projectFileService, properties);
    }

    private final CodeCheckServiceImpl service = service(CodeCheckProperties.defaults());

    private void aPreviewIsRunning() {
        Preview preview = new Preview();
        preview.setPodName(POD);
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(PROJECT_ID, List.of(PreviewStatus.RUNNING)))
                .thenReturn(Optional.of(preview));
        when(runnerPool.isAlive(POD)).thenReturn(true);
    }

    private void thePodAnswers(ExecResult compiler) {
        thePodAnswers(compiler, new ExecResult(0, ""));
    }

    private void thePodAnswers(ExecResult compiler, ExecResult registry) {
        when(runnerPool.exec(eq(POD), eq(PreviewRunnerPool.RUNNER_CONTAINER), any(Duration.class), anyString()))
                .thenAnswer(call -> {
                    String script = call.getArgument(3);
                    scripts.add(script);
                    if (script.equals(CodeCheckServiceImpl.TYPE_CHECK_SCRIPT)) return compiler;
                    if (script.contains("npm view")) return registry;
                    return new ExecResult(0, "");
                });
    }

    private static CodeCheckRequest turn(Map<String, String> files) {
        return new CodeCheckRequest(files, List.of());
    }

    @Test
    void aCompilerErrorInAFileTheTurnWroteIsReported() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(2, PAGE + "(2,9): error TS2322: Type 'string' is not assignable to type 'number'.\n"
                + "src/other/Old.tsx(1,1): error TS2304: Cannot find name 'foo'.\n"));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(PAGE, "export default 1;")));

        assertThat(response.checked()).isTrue();
        assertThat(response.problems()).containsExactly(
                new Problem(PAGE, 2, 9, "TS2322", "Type 'string' is not assignable to type 'number'."));
    }

    @Test
    void aTurnTheCompilerAcceptsIsCheckedAndClean() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(0, ""));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(PAGE, "export default 1;")));

        assertThat(response.checked()).isTrue();
        assertThat(response.problems()).isEmpty();
    }

    @Test
    void theTurnsFilesAreWrittenToAScratchFolderAndNeverOverThePreviewsOwnCopy() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(0, ""));

        service.check(PROJECT_ID, new CodeCheckRequest(
                Map.of(PAGE, "export default 1;", "src/lib/it's.ts", "export {};"), List.of("src/Old.tsx")));

        ArgumentCaptor<String> uploaded = ArgumentCaptor.forClass(String.class);
        verify(runnerPool, org.mockito.Mockito.times(2)).uploadFile(eq(POD), eq(PreviewRunnerPool.RUNNER_CONTAINER),
                uploaded.capture(), any());
        assertThat(uploaded.getAllValues()).allSatisfy(path -> assertThat(path).startsWith("/tmp/check/"));
        verify(runnerPool).uploadFile(POD, PreviewRunnerPool.RUNNER_CONTAINER, "/tmp/check/" + PAGE,
                "export default 1;".getBytes(StandardCharsets.UTF_8));

        String prepare = scripts.getFirst();
        assertThat(prepare)
                .contains("rm -rf /tmp/check")
                .contains("! -name node_modules")
                .contains("ln -s /app/node_modules /tmp/check/node_modules")
                .contains("mkdir -p '/tmp/check/src/")
                .contains("'/tmp/check/src/pages'")
                .contains("'/tmp/check/src/lib'")
                .contains("rm -f '/tmp/check/src/Old.tsx'");
        assertThat(scripts).noneMatch(script -> script.contains("> /app/") || script.contains("cp ") && script.contains(" /app/ "));
    }

    @Test
    void aQuoteInAPathCannotEndTheQuotingAroundIt() {
        assertThat(CodeCheckServiceImpl.quoted("src/it's.ts")).isEqualTo("'src/it'\\''s.ts'");
        assertThat(CodeCheckServiceImpl.prepareScript(Set.of("a'; rm -rf /; '/x.ts"), List.of()))
                .contains("mkdir -p '/tmp/check/a'\\''; rm -rf ");
    }

    @Test
    void aPathThatLeavesTheProjectIsRefusedBeforeAnythingReachesThePod() {
        aPreviewIsRunning();

        assertThatThrownBy(() -> service.check(PROJECT_ID, turn(Map.of("../../etc/passwd.ts", "x"))))
                .isInstanceOf(BadRequestException.class);

        verify(runnerPool, never()).exec(any(), any(), any(), any());
        verify(runnerPool, never()).uploadFile(any(), any(), any(), any());
    }

    @Test
    void theScratchFolderIsRemovedAfterwardsEvenWhenTheCheckFailed() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(2, PAGE + "(1,1): error TS1005: ';' expected.\n"));

        service.check(PROJECT_ID, turn(Map.of(PAGE, "export default 1")));

        assertThat(scripts.getLast()).startsWith("rm -rf /tmp/check");
    }

    @Test
    void withNoPreviewRunningNothingIsCheckedAndNothingTouchesTheCluster() {
        when(previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(any(), any())).thenReturn(Optional.empty());

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(PAGE, "export default 1;")));

        assertThat(response.checked()).isFalse();
        assertThat(response.skippedBecause()).isEqualTo("No preview is running for this project.");
        assertThat(response.problems()).isEmpty();
        verify(runnerPool, never()).exec(any(), any(), any(), any());
    }

    @Test
    void aRunnerThatHasGoneIsNotChecked() {
        aPreviewIsRunning();
        when(runnerPool.isAlive(POD)).thenReturn(false);

        assertThat(service.check(PROJECT_ID, turn(Map.of(PAGE, "x"))).checked()).isFalse();
    }

    @Test
    void aClusterThatCannotBeReachedIsNotAnError() {
        aPreviewIsRunning();
        when(runnerPool.exec(any(), any(), any(), anyString()))
                .thenThrow(new ExternalServiceException("Couldn't reach the preview cluster", new RuntimeException()));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(PAGE, "x")));

        assertThat(response.checked()).isFalse();
        assertThat(response.problems()).isEmpty();
    }

    @Test
    void aProjectWithNoTypeScriptSetupIsNotChecked() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(CodeCheckServiceImpl.NO_TSCONFIG, ""));

        assertThat(service.check(PROJECT_ID, turn(Map.of(PAGE, "x"))).checked()).isFalse();
    }

    @Test
    void aCompilerThatOutranItsTimeIsNotChecked() {
        aPreviewIsRunning();
        thePodAnswers(new ExecResult(-1, "(timed out after 40s)"));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(PAGE, "x")));

        assertThat(response.checked()).isFalse();
        assertThat(response.skippedBecause()).isEqualTo("The check ran out of time.");
    }

    @Test
    void aTurnThatWroteOnlyStylesOrMarkupIsNotSentToTheCompiler() {
        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of("src/index.css", "body {}", "index.html", "<html>")));

        assertThat(response.checked()).isFalse();
        verify(previewRepository, never()).findFirstByProjectIdAndStatusInOrderByIdDesc(any(), any());
    }

    @Test
    void aTurnTooLargeToCheckIsNotChecked() {
        CodeCheckServiceImpl small = service(new CodeCheckProperties(true, null, 1, null, null, null));

        CodeCheckResponse response = small.check(PROJECT_ID, turn(Map.of(PAGE, "x", "src/App.tsx", "y")));

        assertThat(response.checked()).isFalse();
        assertThat(response.skippedBecause()).contains("too large");
    }

    @Test
    void theCheckCanBeTurnedOff() {
        CodeCheckServiceImpl off = service(new CodeCheckProperties(false, null, null, null, null, null));

        assertThat(off.check(PROJECT_ID, turn(Map.of(PAGE, "x"))).checked()).isFalse();
        verify(previewRepository, never()).findFirstByProjectIdAndStatusInOrderByIdDesc(any(), any());
    }

    private void thePackageFileWas(String content) {
        when(projectFileService.getFileContent(PROJECT_ID, "package.json"))
                .thenReturn(new FileContentResponse("package.json", content));
    }

    @Test
    void aPackageTheTurnAddsThatTheRegistryDoesNotHaveIsReported() {
        aPreviewIsRunning();
        thePackageFileWas("{\"dependencies\":{\"react\":\"^18.3.1\"}}");
        thePodAnswers(new ExecResult(0, ""), new ExecResult(0, "MISSING react-magic-charts\n"));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of("package.json",
                "{\"dependencies\":{\"react\":\"^18.3.1\",\"react-magic-charts\":\"^1.0.0\",\"zod\":\"^3.0.0\"}}")));

        assertThat(response.checked()).isTrue();
        assertThat(response.problems()).singleElement().satisfies(problem -> {
            assertThat(problem.path()).isEqualTo("package.json");
            assertThat(problem.message()).contains("\"react-magic-charts\" does not exist in the npm registry");
        });
        String lookup = scripts.stream().filter(script -> script.contains("npm view")).findFirst().orElseThrow();
        assertThat(lookup).contains("'react-magic-charts'").contains("'zod'").doesNotContain("'react'");
    }

    @Test
    void aPackageNameThatCouldNotBeARealOneIsReportedWithoutBeingPutInACommand() {
        aPreviewIsRunning();
        thePackageFileWas("{\"dependencies\":{}}");
        thePodAnswers(new ExecResult(0, ""));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of("package.json",
                "{\"dependencies\":{\"$(reboot)\":\"1.0.0\"}}")));

        assertThat(response.problems()).singleElement()
                .satisfies(problem -> assertThat(problem.message()).contains("is not a valid npm package name"));
        assertThat(scripts).noneMatch(script -> script.contains("reboot"));
    }

    @Test
    void aRegistryThatCouldNotBeAskedReportsNothingMissing() {
        assertThat(CodeCheckServiceImpl.missingPackages("npm error code ETIMEDOUT\n", List.of("zod"))).isEmpty();
        assertThat(CodeCheckServiceImpl.missingPackages("MISSING something-else\n", List.of("zod"))).isEmpty();
        assertThat(CodeCheckServiceImpl.missingPackages(null, List.of("zod"))).isEmpty();
    }

    @Test
    void theCompilerDoesNotReportAPackageTheTurnHasJustAdded() {
        aPreviewIsRunning();
        thePackageFileWas("{\"dependencies\":{\"react\":\"^18.3.1\"}}");
        thePodAnswers(new ExecResult(2, PAGE + "(1,22): error TS2307: Cannot find module 'canvas-confetti' or its "
                + "corresponding type declarations.\n"));

        CodeCheckResponse response = service.check(PROJECT_ID, turn(Map.of(
                "package.json", "{\"dependencies\":{\"react\":\"^18.3.1\",\"canvas-confetti\":\"^1.9.0\"}}",
                PAGE, "import confetti from \"canvas-confetti\";")));

        assertThat(response.checked()).isTrue();
        assertThat(response.problems()).isEmpty();
    }

    @Test
    void whenTheStoredPackageFileCannotBeReadNoPackageIsTreatedAsNew() {
        aPreviewIsRunning();
        when(projectFileService.getFileContent(PROJECT_ID, "package.json")).thenThrow(new RuntimeException("storage down"));
        thePodAnswers(new ExecResult(0, ""));

        service.check(PROJECT_ID, turn(Map.of("package.json", "{\"dependencies\":{\"zod\":\"^3.0.0\"}}")));

        assertThat(scripts).noneMatch(script -> script.contains("npm view"));
    }

    @Test
    void thePackagesOfAPackageFileAreItsDependenciesAndDevDependencies() {
        assertThat(CodeCheckServiceImpl.packagesOf("{\"dependencies\":{\"a\":\"1\"},\"devDependencies\":{\"b\":\"1\"}}"))
                .contains(Set.of("a", "b"));
        assertThat(CodeCheckServiceImpl.packagesOf("{\"name\":\"x\"}")).contains(Set.of());
        assertThat(CodeCheckServiceImpl.packagesOf("not json")).isEmpty();
    }
}
