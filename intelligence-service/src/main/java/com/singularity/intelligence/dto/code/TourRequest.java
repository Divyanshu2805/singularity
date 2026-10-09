package com.singularity.intelligence.dto.code;

import com.singularity.intelligence.enums.LearnerLevel;

/**
 * A request for the tour of a whole project.
 *
 * <p>Handles: how much code the reader knows and whether to write the tour again over the one already kept. Nothing
 * else is taken from the browser: the files are read from the project itself. Read-only: nothing here can change a
 * file.
 *
 * <p>Without {@code rewrite}, a tour that was already written is returned as it is kept, whatever level is asked for.
 */
public record TourRequest(

        LearnerLevel level,

        boolean rewrite
) {
}
