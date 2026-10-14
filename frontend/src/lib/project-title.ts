/**
 * What a project is called on screen, and asking for that title once when a project has none.
 *
 * Handles: the title every list and header shows - the project's summary, written by a model (the idea interview's,
 * or a call of its own) or set to what the owner typed when they renamed it - falling back to its name while there is
 * none, so the sidebar, the project's header, its card and search always read the same words; deciding when an
 * untitled project should have one written (someone who may edit it, a first turn finished, nothing streaming, not
 * asked already this session); and putting a title into the cached project list.
 *
 * The name stays what links, repositories and the colour of a project's tile come from, so a title arriving does not
 * change a tile's colour. A title is asked for at most once per project per session, whatever the answer: an empty one
 * means there was nothing to write it from or nothing to spend, and asking again on every visit would only spend
 * more. That record is user state, so it is cleared on sign-out.
 */
import { onSignOut } from "./session";
import type { ProjectSummaryResponse } from "./types";

type Titled = { name: string; summary?: string | null };

export function projectTitle(project: Titled | null | undefined, fallback = ""): string {
  if (!project) return fallback;
  const title = project.summary?.trim();
  return title || project.name || fallback;
}

export function hasTitle(project: Titled | null | undefined): boolean {
  return !!project?.summary?.trim();
}

const asked = new Set<string>();

export interface TitleRequestState {
  projectId: string;
  project: Titled | null | undefined;
  canEdit: boolean;
  hasFinishedTurn: boolean;
  isStreaming: boolean;
}

export function shouldRequestTitle({ projectId, project, canEdit, hasFinishedTurn, isStreaming }: TitleRequestState): boolean {
  return !!projectId && !!project && canEdit && hasFinishedTurn && !isStreaming && !hasTitle(project) && !asked.has(projectId);
}

export function markTitleRequested(projectId: string) {
  asked.add(projectId);
}

export function withTitle(
  projects: ProjectSummaryResponse[] | undefined,
  projectId: string,
  title: string,
  name?: string
): ProjectSummaryResponse[] | undefined {
  return projects?.map((project) =>
    String(project.id) === projectId ? { ...project, summary: title, ...(name ? { name } : {}) } : project
  );
}

export function resetTitleRequests() {
  asked.clear();
}

onSignOut(resetTitleRequests);
