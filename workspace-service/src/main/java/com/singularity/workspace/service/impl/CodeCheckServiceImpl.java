package com.singularity.workspace.service.impl;

import com.singularity.common.dto.CodeCheckRequest;
import com.singularity.common.dto.CodeCheckResponse;
import com.singularity.common.dto.CodeCheckResponse.Problem;
import com.singularity.common.error.ExternalServiceException;
import com.singularity.workspace.config.CodeCheckProperties;
import com.singularity.workspace.entity.Preview;
import com.singularity.workspace.enums.PreviewStatus;
import com.singularity.workspace.repository.PreviewRepository;
import com.singularity.workspace.service.CodeCheckService;
import com.singularity.workspace.service.ProjectFileService;
import com.singularity.workspace.service.impl.PreviewRunnerPool.ExecResult;
import com.singularity.workspace.util.ProjectFilePath;
import com.singularity.workspace.util.TypeCheckOutput;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

import static com.singularity.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;

/**
 * Type-checks a build turn's files in the project's running preview pod, before the turn is saved.
 *
 * <p>Handles: finding the project's running preview; laying out, in a scratch folder of its runner container, the
 * project as the turn would leave it - a copy of the pod's own files with the turn's files written over them and its
 * deletes removed; running the TypeScript compiler there against the packages the pod already has installed; asking
 * the registry whether each package the turn adds exists; and reporting what was found, or that no check was made.
 *
 * <p>It runs in the preview pod because that is the one place the project's code and its {@code node_modules} are
 * together. The build pipeline can parse a file and resolve an import by name, but only a compiler with the packages
 * in front of it can say that a component was given a prop it does not take or that a hook returns something else.
 * The generated code is never run by this: the compiler reads it. And it is never laid out anywhere but the pod, which
 * is where generated code is allowed to be.
 *
 * <p>The scratch folder is the point. The pod's own copy of the project is what the person's preview is serving, and
 * it is kept in step with storage by a watcher; writing an unsaved turn over it would show the person files that may
 * never be saved, and the watcher would then take them away again. {@code node_modules} is linked, not copied.
 *
 * <p>Everything here fails open. No preview, a pod that has gone, a cluster that cannot be reached, a project with no
 * {@code tsconfig.json}, a check that outruns its time: each is reported as "not checked", and the turn is saved on
 * the pipeline's own static checks. A build must never be held up, or lost, by the thing meant to improve it.
 *
 * <p>A path is put into a shell command only inside single quotes with any quote in it escaped, and a package name
 * only after it has matched the registry's own naming rule. The pod is where generated code runs anyway, so a
 * crafted name could do nothing there that the project's own code could not - but a command that breaks on an
 * apostrophe in a file name is a check that silently stops working.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class CodeCheckServiceImpl implements CodeCheckService {

    static final String SCRATCH = "/tmp/check";
    static final String PACKAGE_JSON = "package.json";
    static final int NO_TSCONFIG = 97;

    private static final Duration CLEAN_UP_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration REGISTRY_TIMEOUT = Duration.ofSeconds(20);
    private static final Duration SHORTEST_USEFUL_RUN = Duration.ofSeconds(5);
    private static final Pattern PACKAGE_NAME =
            Pattern.compile("^(@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*$");
    private static final int MAX_PACKAGE_NAME_CHARS = 214;
    private static final Pattern CHECKED_FILE = Pattern.compile(".+\\.(ts|tsx|mts|cts)$");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    static final String TYPE_CHECK_SCRIPT = "cd " + SCRATCH + " || exit " + NO_TSCONFIG + "\n"
            + "[ -f tsconfig.json ] || exit " + NO_TSCONFIG + "\n"
            + "[ -x node_modules/.bin/tsc ] || exit " + NO_TSCONFIG + "\n"
            + "node_modules/.bin/tsc --noEmit --pretty false -p tsconfig.json > /tmp/check.out 2>&1\n"
            + "code=$?\n"
            + "head -c 24000 /tmp/check.out\n"
            + "exit $code\n";

    private final PreviewRepository previewRepository;
    private final PreviewRunnerPool runnerPool;
    private final ProjectFileService projectFileService;
    private final CodeCheckProperties properties;

    @Override
    public CodeCheckResponse check(Long projectId, CodeCheckRequest request) {
        if (!properties.enabled()) {
            return CodeCheckResponse.skipped("The check is turned off.");
        }
        Map<String, String> files = new LinkedHashMap<>();
        if (request.files() != null) {
            request.files().forEach((path, content) -> files.put(ProjectFilePath.normalize(path), content == null ? "" : content));
        }
        List<String> deleted = request.deleted() == null ? List.of()
                : request.deleted().stream().map(ProjectFilePath::normalize).toList();

        boolean changesPackages = files.containsKey(PACKAGE_JSON);
        if (!changesPackages && files.keySet().stream().noneMatch(path -> CHECKED_FILE.matcher(path).matches())) {
            return CodeCheckResponse.skipped("The turn wrote nothing the compiler reads.");
        }
        long characters = files.values().stream().mapToLong(String::length).sum();
        if (files.size() > properties.maxFiles() || characters > properties.maxTotalChars()) {
            return CodeCheckResponse.skipped("The turn is too large to check before saving.");
        }

        Optional<Preview> preview = previewRepository.findFirstByProjectIdAndStatusInOrderByIdDesc(
                projectId, List.of(PreviewStatus.RUNNING));
        if (preview.isEmpty() || preview.get().getPodName() == null) {
            return CodeCheckResponse.skipped("No preview is running for this project.");
        }
        String pod = preview.get().getPodName();
        long deadline = System.nanoTime() + properties.timeout().toNanos();

        try {
            if (!runnerPool.isAlive(pod)) {
                return CodeCheckResponse.skipped("The preview's runner has gone.");
            }
            ExecResult prepared = runnerPool.exec(pod, RUNNER_CONTAINER, remaining(deadline), prepareScript(files.keySet(), deleted));
            if (!prepared.succeeded()) {
                log.warn("Couldn't lay out projectId: {} for a type-check in {}: {}", projectId, pod, prepared.output());
                return CodeCheckResponse.skipped("The preview could not be prepared for the check.");
            }
            for (Map.Entry<String, String> file : files.entrySet()) {
                runnerPool.uploadFile(pod, RUNNER_CONTAINER, SCRATCH + "/" + file.getKey(),
                        file.getValue().getBytes(StandardCharsets.UTF_8));
            }

            Set<String> added = changesPackages ? addedPackages(projectId, files.get(PACKAGE_JSON)) : Set.of();
            List<Problem> problems = new ArrayList<>(packageProblems(pod, added, deadline));

            if (remaining(deadline).compareTo(SHORTEST_USEFUL_RUN) < 0) {
                return problems.isEmpty() ? CodeCheckResponse.skipped("The check ran out of time.") : CodeCheckResponse.of(problems);
            }
            ExecResult compiled = runnerPool.exec(pod, RUNNER_CONTAINER, remaining(deadline), TYPE_CHECK_SCRIPT);
            if (compiled.exitCode() == NO_TSCONFIG || compiled.exitCode() < 0) {
                String why = compiled.exitCode() < 0 ? "The check ran out of time." : "The project has no TypeScript setup to check against.";
                return problems.isEmpty() ? CodeCheckResponse.skipped(why) : CodeCheckResponse.of(problems);
            }
            if (!compiled.succeeded()) {
                problems.addAll(TypeCheckOutput.problems(compiled.output(), files.keySet(), added,
                        Math.max(1, properties.maxProblems() - problems.size())));
            }
            log.info("Type-checked {} file(s) for projectId: {} in {} - {} problem(s)", files.size(), projectId, pod, problems.size());
            return CodeCheckResponse.of(problems);
        } catch (ExternalServiceException e) {
            log.warn("Couldn't type-check a turn for projectId: {} in {}", projectId, pod, e);
            return CodeCheckResponse.skipped("The preview could not be reached.");
        } finally {
            cleanUp(pod);
        }
    }

    private void cleanUp(String pod) {
        try {
            runnerPool.exec(pod, RUNNER_CONTAINER, CLEAN_UP_TIMEOUT, "rm -rf " + SCRATCH + " /tmp/check.out; true");
        } catch (RuntimeException e) {
            log.debug("Couldn't remove the type-check scratch folder from {}", pod, e);
        }
    }

    private static Duration remaining(long deadline) {
        long nanos = deadline - System.nanoTime();
        return nanos <= 0 ? Duration.ofMillis(1) : Duration.ofNanos(nanos);
    }

    static String prepareScript(Set<String> written, List<String> deleted) {
        Set<String> folders = new LinkedHashSet<>();
        for (String path : written) {
            int slash = path.lastIndexOf('/');
            if (slash > 0) {
                folders.add(SCRATCH + "/" + path.substring(0, slash));
            }
        }
        StringBuilder script = new StringBuilder("set -e\n")
                .append("rm -rf ").append(SCRATCH).append("\n")
                .append("mkdir -p ").append(SCRATCH).append("\n")
                .append("cd /app\n")
                .append("find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name dist ! -name .git -exec cp -R {} ")
                .append(SCRATCH).append("/ \\;\n")
                .append("if [ -d /app/node_modules ]; then ln -s /app/node_modules ").append(SCRATCH).append("/node_modules; fi\n");
        if (!folders.isEmpty()) {
            script.append("mkdir -p");
            folders.forEach(folder -> script.append(' ').append(quoted(folder)));
            script.append('\n');
        }
        if (!deleted.isEmpty()) {
            script.append("rm -f");
            deleted.forEach(path -> script.append(' ').append(quoted(SCRATCH + "/" + path)));
            script.append('\n');
        }
        return script.toString();
    }

    static String quoted(String value) {
        return "'" + value.replace("'", "'\\''") + "'";
    }

    private Set<String> addedPackages(Long projectId, String newPackageJson) {
        Optional<Set<String>> now = packagesOf(newPackageJson);
        if (now.isEmpty()) {
            return Set.of();
        }
        Optional<Set<String>> before;
        try {
            before = packagesOf(projectFileService.getFileContent(projectId, PACKAGE_JSON).content());
        } catch (RuntimeException e) {
            log.debug("Couldn't read the stored package.json of projectId: {} to see what a turn adds", projectId, e);
            return Set.of();
        }
        if (before.isEmpty()) {
            return Set.of();
        }
        Set<String> added = new LinkedHashSet<>(now.get());
        added.removeAll(before.get());
        return added;
    }

    static Optional<Set<String>> packagesOf(String packageJson) {
        try {
            JsonNode root = JSON.readTree(packageJson);
            Set<String> names = new LinkedHashSet<>();
            for (String section : List.of("dependencies", "devDependencies")) {
                JsonNode packages = root.get(section);
                if (packages != null && packages.isObject()) {
                    names.addAll(packages.propertyNames());
                }
            }
            return Optional.of(names);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    private List<Problem> packageProblems(String pod, Set<String> added, long deadline) {
        List<Problem> problems = new ArrayList<>();
        List<String> toLookUp = new ArrayList<>();
        for (String name : added) {
            if (name.length() > MAX_PACKAGE_NAME_CHARS || !PACKAGE_NAME.matcher(name).matches()) {
                problems.add(new Problem(PACKAGE_JSON, 0, 0, "NPM",
                        "\"" + name + "\" is not a valid npm package name."));
            } else if (toLookUp.size() < properties.maxNewPackages()) {
                toLookUp.add(name);
            }
        }
        if (toLookUp.isEmpty()) {
            return problems;
        }
        Duration limit = remaining(deadline).compareTo(REGISTRY_TIMEOUT) < 0 ? remaining(deadline) : REGISTRY_TIMEOUT;
        ExecResult looked = runnerPool.exec(pod, RUNNER_CONTAINER, limit, registryScript(toLookUp));
        problems.addAll(missingPackages(looked.output(), toLookUp));
        return problems;
    }

    static String registryScript(List<String> names) {
        StringBuilder script = new StringBuilder("for p in");
        names.forEach(name -> script.append(' ').append(quoted(name)));
        return script.append("; do out=$(npm view \"$p\" name --loglevel=error 2>&1) || "
                + "case \"$out\" in *E404*) echo \"MISSING $p\" ;; esac; done; true").toString();
    }

    static List<Problem> missingPackages(String output, List<String> lookedUp) {
        List<Problem> problems = new ArrayList<>();
        if (output == null) {
            return problems;
        }
        for (String line : output.split("\\R")) {
            if (!line.startsWith("MISSING ")) {
                continue;
            }
            String name = line.substring("MISSING ".length()).strip();
            if (lookedUp.contains(name)) {
                problems.add(new Problem(PACKAGE_JSON, 0, 0, "NPM", "The package \"" + name
                        + "\" does not exist in the npm registry, so it cannot be installed."));
            }
        }
        return problems;
    }
}
