package com.singularity.workspace.dto.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * One file's new text, typed by hand in the workspace's editor.
 *
 * <p>Handles: the path, the whole new content, and the hash of the content the edit was made against - the one a read
 * of the file returned. The hash is what stops a tab that has fallen behind from writing over a newer version; the
 * size limit is the largest file the editor is meant for, well under the Gateway's one megabyte.
 */
public record SaveFileRequest(
        @NotBlank(message = "A file path is required")
        @Size(max = 400, message = "File path must be at most 400 characters")
        String path,

        @NotNull(message = "The file's content is required")
        @Size(max = 200000, message = "A file edited by hand can be at most 200,000 characters")
        String content,

        @NotBlank(message = "The hash of the version you edited is required")
        @Size(max = 128, message = "That is not a content hash")
        String baseHash
) {
}
