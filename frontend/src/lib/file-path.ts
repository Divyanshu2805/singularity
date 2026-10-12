/**
 * Checking the path of a file a person is about to add by hand, before it is sent.
 *
 * Handles: tidying what was typed, and saying in one sentence what is wrong with it - nothing typed, a character or
 * a shape a project path cannot have, a file already there, or a folder of that name.
 *
 * The rules repeat the server's (ProjectFilePath.java and FileEditServiceImpl.createFile): the server enforces them,
 * this only saves a round trip and says why under the field. A rule changed there must change here.
 */
export const FILE_PATH_MAX = 400;

/** What was typed, without the spaces around it or a leading "./". */
export const tidyFilePath = (input: string) => input.trim().replace(/^\.\//, "");

export function newFilePathProblem(input: string, existing: readonly string[]): string | null {
  const path = tidyFilePath(input);
  if (!path) return null;
  if (path.length > FILE_PATH_MAX) return `A path can be at most ${FILE_PATH_MAX} characters.`;
  if (path.includes("\\")) return "Use / between folders, not \\.";
  if (path.startsWith("/")) return "Leave out the first /. The path starts at the project's top folder.";
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(path)) return "That path has a character a file name cannot hold.";
  const segments = path.split("/");
  if (segments.some((segment) => segment === "")) return path.endsWith("/") ? "Finish the path with the file's name." : "There is an empty folder name in that path.";
  if (segments.some((segment) => segment === "." || segment === "..")) return "A path cannot go through . or ..";
  if (existing.includes(path)) return "There is already a file there.";
  if (existing.some((other) => other.startsWith(`${path}/`) || path.startsWith(`${other}/`))) {
    return "A file and a folder cannot share a name. Choose another.";
  }
  return null;
}
