package com.singularity.intelligence.dto.code;

import com.singularity.intelligence.enums.LearnerLevel;
import jakarta.validation.constraints.NotNull;

/**
 * A request to check whether the person has made the change a task asked for.
 *
 * <p>Handles: naming the step the task was set from, and how much code the reader knows. The task itself is read
 * from the saved step and the file from the project as it is saved now, so nothing the browser sends can say what
 * was asked or what the file holds. Read-only: nothing here can change a file.
 */
public record TaskCheckRequest(

        @NotNull(message = "The step whose task to check is required")
        Long eventId,

        LearnerLevel level
) {
}
