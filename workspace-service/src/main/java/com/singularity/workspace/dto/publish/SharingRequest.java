package com.singularity.workspace.dto.publish;

import jakarta.validation.constraints.NotNull;

/**
 * Whether a published app's code is shared on its public page.
 *
 * <p>Handles: the one switch the owner flips.
 */
public record SharingRequest(
        @NotNull(message = "Say whether the code is shared")
        Boolean shared
) {
}
