package com.singularity.intelligence.dto.code;

import com.singularity.intelligence.enums.LearnerLevel;
import jakarta.validation.constraints.NotNull;

/**
 * A step of a saved build turn, to be given a small "try changing this" task.
 *
 * <p>Handles: naming the step by the id of the file edit the turn saved, and how much code the reader knows. Nothing
 * else is taken from the browser: what the step changed is read from the caller's own saved conversation, as a
 * lesson's is. Read-only: nothing here can change a file; the person makes the change themselves.
 */
public record TaskRequest(

        @NotNull(message = "The step to set a task from is required")
        Long eventId,

        LearnerLevel level
) {
}
