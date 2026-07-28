package com.vibecraft.workspace.dto.project;

import java.util.List;

/**
 * Every file in a project.
 *
 * <p>Handles: the flat list the editor builds its tree from.
 */
public record FileTreeResponse(List<FileNode> files) {
}
