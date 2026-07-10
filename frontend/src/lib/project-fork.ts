import type { ProjectRole } from "./types";

/** Who can fork: an editor of someone else's project. The owner already has the project to work on, and a viewer can't edit. */
export const canForkProject = (role: ProjectRole | string | undefined) => role === "EDITOR";
