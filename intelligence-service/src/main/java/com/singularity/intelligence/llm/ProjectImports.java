package com.singularity.intelligence.llm;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks that the files a turn wrote only import things that will exist once the turn is saved.
 *
 * <p>Handles: reading the import and re-export statements out of each written script, resolving a relative path or
 * an {@code @/} alias the way the project's bundler does (the extensions it tries, an index file in a folder, a
 * {@code .js} written for a {@code .ts}), and checking a package name against what package.json lists. It reports
 * each import that cannot resolve, with the file that makes it.
 *
 * <p>This is the cheapest check that catches the most common way a generated app breaks: a page importing a hook the
 * model planned and never wrote, or a package it used without adding. Both stop the dev server on its first screen
 * with "Failed to resolve import". It reads text only and runs nothing - generated code executes in a runner pod and
 * nowhere else.
 *
 * <p>It is deliberately one-sided. Anything it cannot be sure about is let through - a specifier it does not
 * recognise, a path that climbs out of the project, package names when package.json is missing or unreadable - since
 * a wrong report costs a whole extra model call and may talk the model into "fixing" working code. An import
 * statement is only read where it starts a line, so a code sample shown inside a page is not mistaken for one.
 */
public final class ProjectImports {

    public enum Kind {
        MISSING_FILE,
        MISSING_PACKAGE
    }

    public record Problem(String file, String specifier, Kind kind) {

        public String describe() {
            return kind == Kind.MISSING_FILE
                    ? "`" + file + "` imports \"" + specifier + "\", but no such file exists in the project."
                    : "`" + file + "` imports \"" + specifier + "\", but that package is not listed in package.json.";
        }
    }

    static final int MAX_PROBLEMS = 12;

    private static final Set<String> SCRIPT_EXTENSIONS = Set.of("ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts");
    private static final List<String> TRIED_EXTENSIONS = List.of(
            "", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".json", ".css",
            "/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/index.mjs");
    private static final Map<String, List<String>> TYPESCRIPT_FOR = Map.of(
            ".js", List.of(".ts", ".tsx"), ".jsx", List.of(".tsx"), ".mjs", List.of(".mts"), ".cjs", List.of(".cts"));
    private static final Set<String> NODE_BUILTINS = Set.of(
            "assert", "buffer", "child_process", "cluster", "crypto", "dns", "events", "fs", "http", "http2", "https",
            "module", "net", "os", "path", "perf_hooks", "process", "querystring", "readline", "stream",
            "string_decoder", "timers", "tls", "tty", "url", "util", "v8", "vm", "worker_threads", "zlib");
    private static final List<String> DEPENDENCY_SECTIONS = List.of(
            "dependencies", "devDependencies", "peerDependencies", "optionalDependencies");

    private static final Pattern IMPORT_FROM = Pattern.compile(
            "(?m)^[ \\t]*(?:import|export)\\b[\\w\\s{},*$]*?\\bfrom\\s*['\"]([^'\"\\n]+)['\"]");
    private static final Pattern SIDE_EFFECT_IMPORT = Pattern.compile("(?m)^[ \\t]*import\\s*['\"]([^'\"\\n]+)['\"]");
    private static final Pattern DYNAMIC_IMPORT = Pattern.compile("\\bimport\\s*\\(\\s*['\"]([^'\"\\n]+)['\"]\\s*\\)");
    private static final Pattern PACKAGE_NAME = Pattern.compile(
            "^(@[a-z0-9-~][a-z0-9-._~]*/)?[a-z0-9-~][a-z0-9-._~]*$");

    private static final JsonMapper MAPPER = JsonMapper.builder().build();

    private ProjectImports() {
    }

    public static List<Problem> unresolved(Set<String> projectPaths, Map<String, String> writtenFiles, String packageJson) {
        Optional<Set<String>> installed = installedPackages(packageJson);
        Set<Problem> problems = new LinkedHashSet<>();

        for (Map.Entry<String, String> written : writtenFiles.entrySet()) {
            String file = written.getKey();
            if (!isScript(file) || written.getValue() == null) {
                continue;
            }
            for (String specifier : specifiers(written.getValue())) {
                if (isLocal(specifier)) {
                    if (!resolves(projectPaths, file, specifier)) {
                        problems.add(new Problem(file, specifier, Kind.MISSING_FILE));
                    }
                } else if (installed.isPresent()) {
                    Optional<String> packageName = packageOf(specifier);
                    if (packageName.isPresent() && !installed.get().contains(packageName.get())) {
                        problems.add(new Problem(file, specifier, Kind.MISSING_PACKAGE));
                    }
                }
                if (problems.size() == MAX_PROBLEMS) {
                    return List.copyOf(problems);
                }
            }
        }
        return List.copyOf(problems);
    }

    static Set<String> specifiers(String source) {
        Set<String> found = new LinkedHashSet<>();
        for (Pattern pattern : List.of(IMPORT_FROM, SIDE_EFFECT_IMPORT, DYNAMIC_IMPORT)) {
            Matcher matcher = pattern.matcher(source);
            while (matcher.find()) {
                found.add(matcher.group(1).strip());
            }
        }
        return found;
    }

    private static boolean isScript(String path) {
        int dot = path.lastIndexOf('.');
        return dot >= 0 && SCRIPT_EXTENSIONS.contains(path.substring(dot + 1));
    }

    private static boolean isLocal(String specifier) {
        return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("@/")
                || specifier.equals(".") || specifier.equals("..");
    }

    static boolean resolves(Set<String> projectPaths, String importer, String specifier) {
        String clean = withoutQuery(specifier);
        Optional<String> target = clean.startsWith("@/")
                ? Optional.of("src/" + clean.substring(2))
                : relativeTo(importer, clean);
        if (target.isEmpty()) {
            return true;
        }
        String base = target.get();
        for (String extension : TRIED_EXTENSIONS) {
            if (projectPaths.contains(base + extension)) {
                return true;
            }
        }
        for (Map.Entry<String, List<String>> swap : TYPESCRIPT_FOR.entrySet()) {
            if (!base.endsWith(swap.getKey())) {
                continue;
            }
            String stem = base.substring(0, base.length() - swap.getKey().length());
            for (String extension : swap.getValue()) {
                if (projectPaths.contains(stem + extension)) {
                    return true;
                }
            }
        }
        return false;
    }

    private static String withoutQuery(String specifier) {
        int cut = specifier.length();
        for (char marker : new char[]{'?', '#'}) {
            int at = specifier.indexOf(marker);
            if (at >= 0) {
                cut = Math.min(cut, at);
            }
        }
        return specifier.substring(0, cut);
    }

    private static Optional<String> relativeTo(String importer, String specifier) {
        Deque<String> segments = new ArrayDeque<>();
        int slash = importer.lastIndexOf('/');
        if (slash >= 0) {
            for (String segment : importer.substring(0, slash).split("/")) {
                segments.addLast(segment);
            }
        }
        for (String segment : specifier.split("/")) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                if (segments.isEmpty()) {
                    return Optional.empty();
                }
                segments.removeLast();
                continue;
            }
            segments.addLast(segment);
        }
        return segments.isEmpty() ? Optional.empty() : Optional.of(String.join("/", segments));
    }

    static Optional<String> packageOf(String specifier) {
        if (specifier.isEmpty() || specifier.contains(":") || "./~#".indexOf(specifier.charAt(0)) >= 0) {
            return Optional.empty();
        }
        String[] parts = specifier.split("/");
        String name = specifier.startsWith("@") ? (parts.length >= 2 ? parts[0] + "/" + parts[1] : "") : parts[0];
        if (!PACKAGE_NAME.matcher(name).matches() || NODE_BUILTINS.contains(name)) {
            return Optional.empty();
        }
        return Optional.of(name);
    }

    static Optional<Set<String>> installedPackages(String packageJson) {
        if (packageJson == null || packageJson.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = MAPPER.readTree(packageJson);
            if (!root.isObject()) {
                return Optional.empty();
            }
            Set<String> names = new HashSet<>();
            for (String section : DEPENDENCY_SECTIONS) {
                JsonNode dependencies = root.path(section);
                if (dependencies.isObject()) {
                    names.addAll(new ArrayList<>(dependencies.propertyNames()));
                }
            }
            return Optional.of(names);
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }
}
