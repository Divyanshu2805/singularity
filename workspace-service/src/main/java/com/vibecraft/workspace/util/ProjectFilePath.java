package com.vibecraft.workspace.util;

import com.vibecraft.common.error.BadRequestException;

/**
 * The one definition of what a project file path may be, and the canonical form every read and write uses.
 *
 * <p>Handles: normalising a path to its stored form - no leading slash, forward slashes only - and rejecting anything
 * that is not a plain relative path inside the project: blank, absolute, over-long, containing a backslash, a control
 * character, an empty segment, or a . or .. segment. The object key is derived here too, so reads and writes cannot
 * disagree about the same file.
 *
 * <p>Validation is a boundary, not a formality. Paths arrive from the model's file protocol and from callers, and a
 * stored path is later used verbatim in places that do resolve .. - the entry name in a downloaded ZIP, and the
 * destination of the mirror that copies a project into its preview pod. A traversing path would escape the project
 * there even though object storage itself treats the key as opaque. Rejecting it on the way in is what keeps every
 * one of those consumers safe.
 */
public final class ProjectFilePath {

    static final int MAX_LENGTH = 400;

    private ProjectFilePath() {
    }

    public static String normalize(String path) {
        if (path == null || path.isBlank()) {
            throw new BadRequestException("File path must not be blank");
        }
        String candidate = path.strip();
        if (candidate.length() > MAX_LENGTH) {
            throw new BadRequestException("File path must be at most " + MAX_LENGTH + " characters");
        }
        if (candidate.indexOf('\\') >= 0) {
            throw new BadRequestException("File path must use '/' as its separator: " + path);
        }
        if (candidate.chars().anyMatch(c -> c < 0x20 || c == 0x7f)) {
            throw new BadRequestException("File path must not contain control characters");
        }
        if (candidate.length() >= 2 && candidate.charAt(1) == ':') {
            throw new BadRequestException("File path must be relative to the project: " + path);
        }

        String relative = candidate.startsWith("/") ? candidate.substring(1) : candidate;
        if (relative.isEmpty()) {
            throw new BadRequestException("File path must not be blank");
        }

        for (String segment : relative.split("/", -1)) {
            if (segment.isEmpty()) {
                throw new BadRequestException("File path must not contain an empty segment: " + path);
            }
            if (segment.equals(".") || segment.equals("..")) {
                throw new BadRequestException("File path must not contain '.' or '..' segments: " + path);
            }
        }
        return relative;
    }

    public static String objectKey(Long projectId, String path) {
        return projectId + "/" + normalize(path);
    }
}
