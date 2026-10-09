package com.singularity.workspace.util;

import com.singularity.workspace.enums.PreviewFailureKind;
import com.singularity.workspace.enums.PublishFailureKind;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns the output of a failed install or build into one plain sentence and a cause.
 *
 * <p>Handles: an install that failed (the same causes the preview start explains, mapped onto a publish's kinds),
 * and a build that failed - no build script, an import that cannot be found, a syntax error, a TypeScript error, a
 * build killed for memory or out of time. Anything else gets the general sentence for the step.
 *
 * <p>The sentence is for someone who has never read a bundler's output; the output itself is kept beside it for
 * whoever wants it. The cause matters as much as the words: a registry that could not be reached or a disk that was
 * full is the platform's failure, which is worth trying again unchanged, and must not be reported as something wrong
 * with the project.
 *
 * <p>Pure text in, text out - it never runs anything, and names are taken only from the tools' own lines, cleaned and
 * cut short.
 */
public final class PublishFailureExplainer {

    public record Explained(PublishFailureKind kind, String detail) {
    }

    private static final int MAX_NAME_CHARS = 80;

    private static final Pattern ROLLUP_RESOLVE = Pattern.compile(
            "(?:Rollup failed to resolve import|Could not resolve) \"([^\"]+)\"(?: from \"([^\"]+)\")?");
    private static final Pattern ESBUILD_ERROR = Pattern.compile("(?:ERROR|error): (.{1,200})");
    private static final Pattern FILE_WITH_ERROR = Pattern.compile("(?:file|File): ([^\\s:]+)");
    private static final Pattern TS_ERROR = Pattern.compile("([^\\s(]+)\\((\\d+),\\d+\\): error (TS\\d+): (.{1,160})");

    private PublishFailureExplainer() {
    }

    public static Explained install(String log) {
        PreviewFailureExplainer.Explained explained = PreviewFailureExplainer.install(log);
        PublishFailureKind kind = explained.kind() == PreviewFailureKind.PLATFORM
                ? PublishFailureKind.PLATFORM : PublishFailureKind.INSTALL;
        return new Explained(kind, explained.detail());
    }

    public static Explained build(String log) {
        String text = log == null ? "" : log;

        if (text.contains("Missing script: \"build\"") || text.contains("missing script: build")) {
            return project(PublishFailureKind.BUILD,
                    "package.json has no \"build\" script, so there is nothing to build the app with.");
        }
        if (text.contains("vite: not found") || text.contains("vite: command not found")) {
            return project(PublishFailureKind.BUILD, "Vite isn't installed - package.json no longer lists it.");
        }
        if (text.contains("JavaScript heap out of memory") || text.contains("Killed")) {
            return project(PublishFailureKind.TOO_LARGE, "The build ran out of memory. The app may be too large to build here.");
        }
        Matcher resolve = ROLLUP_RESOLVE.matcher(text);
        if (resolve.find()) {
            String what = clip(resolve.group(1));
            String from = resolve.group(2) == null ? null : clip(resolve.group(2));
            return project(PublishFailureKind.BUILD, from == null
                    ? "The app imports \"" + what + "\", which can't be found."
                    : "\"" + from + "\" imports \"" + what + "\", which can't be found - check the name, or add the package.");
        }
        Matcher typeScript = TS_ERROR.matcher(text);
        if (typeScript.find()) {
            return project(PublishFailureKind.BUILD, "TypeScript found a problem in " + clip(typeScript.group(1))
                    + " at line " + typeScript.group(2) + ": " + clip(typeScript.group(4)));
        }
        if (text.contains("Transform failed") || text.contains("Unexpected token") || text.contains("Syntax error")
                || text.contains("Expected")) {
            Matcher file = FILE_WITH_ERROR.matcher(text);
            Matcher error = ESBUILD_ERROR.matcher(text);
            String where = file.find() ? " in " + clip(file.group(1)) : "";
            return project(PublishFailureKind.BUILD, error.find()
                    ? "A file has an error" + where + ": " + clip(error.group(1))
                    : "A file has a syntax error" + where + ".");
        }
        if (text.contains("(timed out after")) {
            return project(PublishFailureKind.TIMEOUT, "The build took too long and was stopped.");
        }
        return project(PublishFailureKind.BUILD, "The build failed. The output below says why.");
    }

    private static Explained project(PublishFailureKind kind, String detail) {
        return new Explained(kind, detail);
    }

    private static String clip(String name) {
        String clean = name.replaceAll("[\\p{Cntrl}]", "").strip();
        return clean.length() <= MAX_NAME_CHARS ? clean : clean.substring(0, MAX_NAME_CHARS) + "...";
    }
}
