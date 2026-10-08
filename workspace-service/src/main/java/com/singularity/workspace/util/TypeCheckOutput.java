package com.singularity.workspace.util;

import com.singularity.common.dto.CodeCheckResponse.Problem;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads what the TypeScript compiler printed into a list of problems.
 *
 * <p>Handles: recognising an error line ({@code src/App.tsx(12,5): error TS2322: ...}), joining the indented lines
 * that continue its message, keeping only errors in the files a turn wrote, and dropping "cannot find module" for a
 * package the same turn added to package.json.
 *
 * <p>Only the turn's own files are reported. A project can already hold an error nobody asked this turn to fix, and
 * sending every one of those back to the model would turn a one-line change into a rewrite of files the request
 * never mentioned. The cost is that a change which breaks a file it did not touch - a prop renamed in one place and
 * still used in another - is not caught here; the preview shows that one.
 *
 * <p>A package the turn has just added is not installed yet where the check runs: the preview reinstalls only after
 * the turn is saved. The compiler therefore cannot find it, and reporting that would have the model take out the
 * dependency it was asked to add. Whether such a package exists at all is checked separately, against the registry.
 */
public final class TypeCheckOutput {

    private static final Pattern ERROR_LINE = Pattern.compile("^(.+?)\\((\\d+),(\\d+)\\): error (TS\\d+): (.*)$");
    private static final Pattern MISSING_MODULE = Pattern.compile("Cannot find module '([^']+)'|"
            + "Could not find a declaration file for module '([^']+)'");
    private static final Set<String> MISSING_MODULE_CODES = Set.of("TS2307", "TS7016");
    private static final int MAX_MESSAGE_CHARS = 600;

    private TypeCheckOutput() {
    }

    public static List<Problem> problems(String output, Set<String> writtenPaths, Set<String> packagesNotYetInstalled,
                                         int limit) {
        List<Problem> problems = new ArrayList<>();
        for (Problem problem : parse(output)) {
            if (!writtenPaths.contains(problem.path())) {
                continue;
            }
            if (MISSING_MODULE_CODES.contains(problem.code())
                    && missingPackage(problem.message()).filter(packagesNotYetInstalled::contains).isPresent()) {
                continue;
            }
            problems.add(problem);
            if (problems.size() >= limit) {
                break;
            }
        }
        return problems;
    }

    static List<Problem> parse(String output) {
        List<Problem> problems = new ArrayList<>();
        if (output == null) {
            return problems;
        }
        String path = null;
        int line = 0;
        int column = 0;
        String code = null;
        StringBuilder message = null;
        for (String raw : output.split("\\R")) {
            Matcher error = ERROR_LINE.matcher(raw);
            if (error.matches()) {
                if (message != null) {
                    problems.add(new Problem(path, line, column, code, shortened(message)));
                }
                path = error.group(1).strip().replace('\\', '/');
                line = Integer.parseInt(error.group(2));
                column = Integer.parseInt(error.group(3));
                code = error.group(4);
                message = new StringBuilder(error.group(5).strip());
            } else if (message != null && (raw.startsWith("  ") || raw.startsWith("\t")) && !raw.isBlank()) {
                message.append(' ').append(raw.strip());
            }
        }
        if (message != null) {
            problems.add(new Problem(path, line, column, code, shortened(message)));
        }
        return problems;
    }

    static Optional<String> missingPackage(String message) {
        Matcher module = MISSING_MODULE.matcher(message);
        if (!module.find()) {
            return Optional.empty();
        }
        String specifier = module.group(1) != null ? module.group(1) : module.group(2);
        if (specifier.startsWith(".") || specifier.startsWith("/") || specifier.startsWith("@/")) {
            return Optional.empty();
        }
        String[] parts = specifier.split("/");
        return Optional.of(specifier.startsWith("@") && parts.length > 1 ? parts[0] + "/" + parts[1] : parts[0]);
    }

    private static String shortened(StringBuilder message) {
        return message.length() <= MAX_MESSAGE_CHARS ? message.toString() : message.substring(0, MAX_MESSAGE_CHARS) + " ...";
    }
}
