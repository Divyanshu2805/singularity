import type { ProjectRole } from "./types";

/**
 * What "delete" does depends on who you are, so the words do too. The owner deletes the project for everyone who has
 * it; anyone else only removes it from their own projects, and the owner and other members keep it.
 */
export function deleteCopy(role: ProjectRole | undefined, projectName: string | undefined) {
  const name = projectName ? `\u201c${projectName}\u201d` : "This project";
  if (role === "OWNER" || role === undefined) {
    return {
      menuLabel: "Delete project",
      title: "Delete this project?",
      description: `${name} will be deleted for everyone who has access to it, including its editors and viewers. This can\u2019t be undone.`,
      confirmLabel: "Delete project",
      doneTitle: "Project deleted",
      failTitle: "Couldn't delete project",
    };
  }
  return {
    menuLabel: "Remove project",
    title: "Remove this project from your projects?",
    description: `You'll lose access to ${name}. It isn't deleted: the owner and everyone else it's shared with keep it, and the owner can invite you back.`,
    confirmLabel: "Remove project",
    doneTitle: "Removed from your projects",
    failTitle: "Couldn't remove project",
  };
}
