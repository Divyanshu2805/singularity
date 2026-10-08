package com.singularity.intelligence.dto.code;

import jakarta.validation.constraints.NotNull;

/**
 * A step of a saved build turn, to be explained in teaching mode.
 *
 * <p>Handles: naming the step by the id of the file edit the turn saved. Nothing else is taken from the browser: the
 * file's text, the version it replaced, what was asked for and the turn's other steps are all read from the caller's
 * own saved conversation, so a lesson can only ever be about a change that really happened. Read-only: nothing here
 * can change a file.
 *
 * <p>It used to carry the whole file as the browser held it. That is why a lesson explained the whole file - there
 * was nothing to compare it with - whatever the step had changed in it.
 */
public record LessonRequest(

        @NotNull(message = "The step to explain is required")
        Long eventId
) {
}
