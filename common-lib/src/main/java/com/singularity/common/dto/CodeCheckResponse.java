package com.singularity.common.dto;

import java.util.List;

/**
 * What a type-check of a build turn's files found, as it crosses workspace-service's internal API.
 *
 * <p>Handles: saying whether the check ran at all, why not when it did not, and each problem found with the file,
 * line and column it is at, the checker's own code for it and its message.
 *
 * <p>A check that did not run is not a failure. It needs the project's preview to be running, since that is the only
 * place the project's code and its installed packages exist together; with no preview, or one that is busy or slow,
 * the caller saves the turn on its static checks alone. {@code checked} false with no problems therefore means
 * "nothing is known", never "nothing is wrong".
 */
public record CodeCheckResponse(
        boolean checked,
        String skippedBecause,
        List<Problem> problems
) {

    public record Problem(String path, int line, int column, String code, String message) {
    }

    public static CodeCheckResponse skipped(String because) {
        return new CodeCheckResponse(false, because, List.of());
    }

    public static CodeCheckResponse of(List<Problem> problems) {
        return new CodeCheckResponse(true, null, List.copyOf(problems));
    }
}
