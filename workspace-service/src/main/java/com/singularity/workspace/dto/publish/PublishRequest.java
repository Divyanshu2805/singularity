package com.singularity.workspace.dto.publish;

import jakarta.validation.constraints.Size;

/**
 * What to publish the app as.
 *
 * <p>Handles: an optional link name, used only the first time a project is published; blank or missing means a name
 * is made from the project's title. The name is validated by {@code PublishedSlug}, not here.
 */
public record PublishRequest(
        @Size(max = 63, message = "The link name should not be more than 63 characters long")
        String slug
) {
}
