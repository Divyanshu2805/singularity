package com.singularity.workspace.util;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The rules for the name of a repository a project is pushed to.
 *
 * <p>Handles: saying what is wrong with a name someone typed, in one sentence, or that nothing is; and making a name
 * to suggest from a project's name.
 *
 * <p>The rules are GitHub's own, checked here so a bad name is refused with a sentence before anything is sent: up to
 * a hundred letters, digits, dots, hyphens and underscores, not a dot or two dots alone, and not ending in
 * {@code .git}. GitHub is still the one that decides - a name already taken there comes back from the call that
 * makes the repository. The browser repeats these rules to say so in the field ({@code lib/github.ts}).
 */
public final class GitHubRepoName {

    public static final int MAX_LENGTH = 100;
    static final int SUGGESTED_MAX = 60;
    static final String FALLBACK = "singularity-app";
    private static final Pattern ALLOWED = Pattern.compile("^[A-Za-z0-9._-]+$");

    private GitHubRepoName() {
    }

    public static String problem(String name) {
        if (name == null || name.isBlank()) {
            return "Give the repository a name.";
        }
        if (name.length() > MAX_LENGTH) {
            return "A repository name can be at most " + MAX_LENGTH + " characters.";
        }
        if (!ALLOWED.matcher(name).matches()) {
            return "A repository name can hold letters, digits, dots, hyphens and underscores only.";
        }
        if (name.equals(".") || name.equals("..")) {
            return "A repository cannot be named with dots alone.";
        }
        if (name.toLowerCase(Locale.ROOT).endsWith(".git")) {
            return "A repository name cannot end in .git.";
        }
        return null;
    }

    public static String suggest(String projectName) {
        if (projectName == null) {
            return FALLBACK;
        }
        String name = projectName.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-+|-+$", "");
        if (name.length() > SUGGESTED_MAX) {
            name = name.substring(0, SUGGESTED_MAX).replaceAll("-+$", "");
        }
        return name.isEmpty() ? FALLBACK : name;
    }
}
