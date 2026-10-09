/**
 * What to tell someone when a project's page cannot be shown.
 *
 * Handles: sorting a failed load into the two things it can mean - the project is not this person's to open (it was
 * deleted, they were removed, they were never invited, or the address is wrong), or the app could not reach it just
 * now - and the words for each. The first is a place to stop and a way back; the second is worth trying again.
 *
 * The server answers a deleted project, a removed member and a stranger alike, on purpose: saying which would tell a
 * stranger that a project exists. So the page does not guess either, and says what the possibilities are.
 */
import { ApiRequestError } from "./api";

export interface ProjectLoadFailure {
  kind: "unavailable" | "error";
  title: string;
  detail: string;
}

export function projectLoadFailure(error: unknown): ProjectLoadFailure {
  const status = error instanceof ApiRequestError ? error.status : null;
  if (status === 403 || status === 404 || status === 400) {
    return {
      kind: "unavailable",
      title: "This project isn't available",
      detail: "It may have been deleted, or it belongs to someone who hasn't shared it with you. If you were sent this link, ask the owner to invite you from the project's Share button.",
    };
  }
  return {
    kind: "error",
    title: "Couldn't load this project",
    detail: error instanceof Error && error.message ? error.message : "Check your connection and try again.",
  };
}
