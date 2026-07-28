/**
 * Who may fork a project.
 *
 * Handles: the one rule - an editor of someone else's project. The owner already has the project to work on, and a
 * viewer cannot edit.
 */
import type { ProjectRole } from "./types";

export const canForkProject = (role: ProjectRole | string | undefined) => role === "EDITOR";
