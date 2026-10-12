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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.singularity.workspace.service.impl.PreviewRunnerPool.RUNNER_CONTAINER;

/**
 * Type-checks a build turn's files in the project's running preview pod, before the turn is saved.
 *
 * <p>Handles: finding the project's running preview; laying out, in a scratch folder of its runner container, the
 * project as the turn would leave it - a copy of the pod's own files with the turn's files written over them and its
 * deletes removed; running the TypeScript compiler there against the packages the pod already has installed; asking
 * the registry whether each package the turn adds exists; starting the project's own server there, when the turn
 * wrote any of it, to see that it comes up; and reporting what was found, or that no check was made.
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
 * <p>Starting the server is the one step that runs the turn's code rather than reading it, and the runner pod is
 * where that is allowed. It exists because of what a server keeps in strings: the SQL that makes its tables is text
 * to the parser and to the compiler alike, and a real model wrote {@code PRIMARY ikey} in one - a turn that was right
 * by every other check and whose server died on its first line, in front of a page that could only say it could not
 * load. So the server is started from the scratch folder, on a port of its own and with an empty database of its
 * own, for a few seconds: one that is listening or still running at the end is fine, and one that has exited with
 * an error is reported with the error, which the pipeline sends back to the model like any compiler error. A server
 * that names its port in code instead of reading {@code PORT} collides with the preview's own and says so; that is
 * taken as having started, since the tables are made before anything listens. It runs only after a clean compile,
 * so the model is never handed two accounts of one mistake.
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

    static final String SERVER_FOLDER = "server/";
    static final String SERVER_ENTRY = "server/index.ts";
    static final int SERVER_CHECK_PORT = 3999;
    static final int SERVER_DID_NOT_START = 96;
    private static final Duration SERVER_START_LIMIT = Duration.ofSeconds(20);
    private static final int SERVER_START_SECONDS = 8;
    private static final int MAX_SERVER_ERROR_CHARS = 700;
    private static final Pattern SERVER_FRAME = Pattern.compile("(server/[\\w./-]+\\.[cm]?[jt]s):(\\d+)");

    static final String SERVER_START_SCRIPT = "cd " + SCRATCH + " || exit 0\n"
            + "[ -f " + SERVER_ENTRY + " ] && [ -d node_modules/tsx ] || exit 0\n"
            + "rm -rf .data /tmp/check.server\n"
            + "PORT=" + SERVER_CHECK_PORT + " NODE_NO_WARNINGS=1 node --import tsx " + SERVER_ENTRY + " > /tmp/check.server 2>&1 &\n"
            + "pid=$!\n"
            + "i=0\n"
            + "while [ $i -lt " + SERVER_START_SECONDS + " ]; do\n"
            + "  sleep 1; i=$((i + 1))\n"
            + "  kill -0 $pid 2>/dev/null || break\n"
            + "  nc -z 127.0.0.1 " + SERVER_CHECK_PORT + " 2>/dev/null && break\n"
            + "done\n"
            + "if kill -0 $pid 2>/dev/null; then kill $pid 2>/dev/null; wait $pid 2>/dev/null; exit 0; fi\n"
            + "wait $pid; code=$?\n"
            + "[ $code -eq 0 ] && exit 0\n"
            + "grep -q EADDRINUSE /tmp/check.server && exit 0\n"
            + "head -c 4000 /tmp/check.server\n"
            + "exit " + SERVER_DID_NOT_START + "\n";

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
            if (problems.isEmpty() && files.keySet().stream().anyMatch(path -> path.startsWith(SERVER_FOLDER))
                    && remaining(deadline).compareTo(Duration.ofSeconds(SERVER_START_SECONDS).plus(SHORTEST_USEFUL_RUN)) > 0) {
                Duration limit = remaining(deadline).compareTo(SERVER_START_LIMIT) < 0 ? remaining(deadline) : SERVER_START_LIMIT;
                ExecResult started = runnerPool.exec(pod, RUNNER_CONTAINER, limit, SERVER_START_SCRIPT);
                if (started.exitCode() == SERVER_DID_NOT_START) {
                    problems.add(serverProblem(started.output(), files.keySet()));
                }
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
            runnerPool.exec(pod, RUNNER_CONTAINER, CLEAN_UP_TIMEOUT, "rm -rf " + SCRATCH + " /tmp/check.out /tmp/check.server; true");
        } catch (RuntimeException e) {
            log.debug("Couldn't remove the type-check scratch folder from {}", pod, e);
        }
    }

    static Problem serverProblem(String output, Set<String> written) {
        String text = (output == null ? "" : output).replace("file://" + SCRATCH + "/", "").replace(SCRATCH + "/", "").strip();
        String path = null;
        int line = 0;
        Matcher frame = SERVER_FRAME.matcher(text);
        while (frame.find()) {
            boolean fromTheTurn = written.contains(frame.group(1));
            if (path == null || fromTheTurn) {
                path = frame.group(1);
                line = Integer.parseInt(frame.group(2));
            }
            if (fromTheTurn) {
                break;
            }
        }
        if (path == null) {
            path = SERVER_ENTRY;
        }
        String error = text.length() > MAX_SERVER_ERROR_CHARS ? text.substring(0, MAX_SERVER_ERROR_CHARS) + " ..." : text;
        return new Problem(path, line, 0, "SERVER", "The project's server was started with these files and stopped at once with this error: "
                + (error.isEmpty() ? "(it printed nothing)" : error));
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
                .append("find . -mindepth 1 -maxdepth 1 ! -name node_modules ! -name dist ! -name .git ! -name .data -exec cp -R {} ")
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
