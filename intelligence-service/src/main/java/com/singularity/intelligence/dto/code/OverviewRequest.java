package com.singularity.intelligence.dto.code;

import com.singularity.intelligence.enums.LearnerLevel;
import jakarta.validation.constraints.NotNull;

/**
 * A saved build turn, to be given its big picture in teaching mode.
 *
 * <p>Handles: naming the turn by the id of the saved reply, and how much code the reader knows. Nothing else is
 * taken from the browser: what was asked for, the turn's steps and the files it wrote are read from the caller's own
 * saved conversation. Read-only: nothing here can change a file.
 */
public record OverviewRequest(

        @NotNull(message = "The turn to explain is required")
        Long messageId,

        LearnerLevel level
) {
}
