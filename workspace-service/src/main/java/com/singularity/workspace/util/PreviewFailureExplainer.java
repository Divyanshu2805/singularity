package com.singularity.workspace.util;

import com.singularity.workspace.enums.PreviewFailureKind;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns the output of a failed install or a dev server that would not start into one plain sentence and a cause.
 *
 * <p>Handles: recognising the failures npm reports by code - a package that does not exist, a version that does not,
 * two packages that cannot agree, a package.json that is not valid JSON, the registry being out of reach, the disk
 * being full - and the ones a dev server dies of before it answers: no dev script, a broken config file, a missing
 * module, a port already taken. Anything else gets the general sentence for its step.
 *
 * <p>The sentence is for someone who has never read npm's output; the output itself is kept beside it for whoever
 * wants it. The cause matters as much as the words: the registry being unreachable or the disk being full is the
 * platform's failure, which the browser tries again by itself, and must not be reported as something wrong with the
 * project.
 *
 * <p>Pure text in, text out - it never runs anything, and package names are taken only from npm's own lines.
 */
public final class PreviewFailureExplainer {

    public record Explained(PreviewFailureKind kind, String detail) {
    }

    private static final int MAX_NAME_CHARS = 80;

    private static final Pattern NPM_CODE = Pattern.compile("npm (?:ERR!|error) code (\\S+)");
    private static final Pattern NOT_IN_REGISTRY = Pattern.compile("404\\s+'([^'@][^'@]*|@[^'@]+)(?:@[^']*)?' is not in this registry");
    private static final Pattern NOT_FOUND_URL = Pattern.compile("404 Not Found - GET https?://[^/\\s]+/(\\S+?)(?: - |\\s|$)");
    private static final Pattern NO_MATCHING_VERSION = Pattern.compile("No matching version found for (\\S+)@(\\S+?)\\.?(?:\\s|$)");
    private static final Pattern MISSING_MODULE = Pattern.compile("Cannot find (?:module|package) '([^']+)'");
    private static final Pattern FAILED_CONFIG = Pattern.compile("failed to load config from \\S*?([\\w.-]+\\.[cm]?[jt]s)");

    private PreviewFailureExplainer() {
    }

    public static Explained install(String log) {
        String text = log == null ? "" : log;
        Matcher code = NPM_CODE.matcher(text);
        String npmCode = code.find() ? code.group(1) : "";

        switch (npmCode) {
            case "E404" -> {
                String name = firstGroup(NOT_IN_REGISTRY, text);
                if (name == null) name = decode(firstGroup(NOT_FOUND_URL, text));
                return project(PreviewFailureKind.INSTALL, name == null
                        ? "A package in package.json doesn't exist on npm - check its name."
                        : "The package \"" + clip(name) + "\" doesn't exist on npm - check its name in package.json.");
            }
            case "ETARGET", "E404VERSION" -> {
                Matcher version = NO_MATCHING_VERSION.matcher(text);
                return project(PreviewFailureKind.INSTALL, version.find()
                        ? "There is no version of \"" + clip(version.group(1)) + "\" matching \"" + clip(version.group(2))
                        + "\" - check its version in package.json."
                        : "A package in package.json asks for a version that doesn't exist.");
            }
            case "ERESOLVE" -> {
                return project(PreviewFailureKind.INSTALL,
                        "Two packages in package.json need versions of the same package that don't fit together.");
            }
            case "EJSONPARSE" -> {
                return project(PreviewFailureKind.INSTALL,
                        "package.json isn't valid JSON - look for a missing comma or quote.");
            }
            case "ENOSPC" -> {
                return project(PreviewFailureKind.PLATFORM, "The preview's runner ran out of disk space while installing.");
            }
            case "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ERR_SOCKET_TIMEOUT",
                 "E500", "E502", "E503", "E504", "FETCH_ERROR" -> {
                return project(PreviewFailureKind.PLATFORM, "The package registry couldn't be reached while installing.");
            }
            default -> {
                if (text.contains("ENOSPC") || text.contains("no space left on device")) {
                    return project(PreviewFailureKind.PLATFORM, "The preview's runner ran out of disk space while installing.");
                }
                return project(PreviewFailureKind.INSTALL, "npm install failed - check package.json.");
            }
        }
    }

    public static Explained devServer(String log) {
        String text = log == null ? "" : log;
        int devStart = text.lastIndexOf("$ npm run dev");
        if (devStart >= 0) text = text.substring(devStart);

        if (text.contains("Missing script: \"dev\"") || text.contains("missing script: dev")) {
            return project(PreviewFailureKind.DEV_SERVER, "package.json has no \"dev\" script, so there is nothing to start the app with.");
        }
        if (text.contains("vite: not found") || text.contains("vite: command not found")) {
            return project(PreviewFailureKind.DEV_SERVER, "Vite isn't installed - package.json no longer lists it.");
        }
        String config = firstGroup(FAILED_CONFIG, text);
        if (config != null) {
            return project(PreviewFailureKind.DEV_SERVER, clip(config) + " has an error, so the dev server couldn't start.");
        }
        String module = firstGroup(MISSING_MODULE, text);
        if (module != null && !module.startsWith("/") && !module.startsWith(".")) {
            return project(PreviewFailureKind.DEV_SERVER,
                    "The dev server needs \"" + clip(module) + "\", which isn't installed - add it to package.json.");
        }
        if (text.contains("is already in use") || text.contains("EADDRINUSE")) {
            return project(PreviewFailureKind.PLATFORM, "The dev server's port was still taken by the one before it.");
        }
        return project(PreviewFailureKind.DEV_SERVER, "The dev server stopped while starting.");
    }

    private static Explained project(PreviewFailureKind kind, String detail) {
        return new Explained(kind, detail);
    }

    private static String firstGroup(Pattern pattern, String text) {
        Matcher matcher = pattern.matcher(text);
        return matcher.find() ? matcher.group(1) : null;
    }

    private static String decode(String urlPath) {
        return urlPath == null ? null : urlPath.replace("%2f", "/").replace("%2F", "/");
    }

    private static String clip(String name) {
        String clean = name.replaceAll("[\\p{Cntrl}\"]", "");
        return clean.length() <= MAX_NAME_CHARS ? clean : clean.substring(0, MAX_NAME_CHARS) + "...";
    }
}
