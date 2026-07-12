/**
 * Where a file's changes start.
 *
 * <p>Turning the diff on used to just repaint the file and leave the reader to find the change themselves -
 * fine for a five-line file, useless for a two-hundred-line one where the edit is somewhere in the middle.
 * This is what the toggle scrolls to.
 *
 * <p>Deliberately a common-prefix scan rather than a real diff: the editor already renders the full diff
 * (`unifiedMergeView` against the same baseline), so all that's needed here is the first line the two
 * versions stop agreeing on, and the first line a proper diff algorithm would call changed is that same line
 * whatever it does after it. A line-by-line walk also can't disagree with what's painted on screen the way a
 * second, differently-tuned diff implementation could.
 */
export function firstChangedLine(original: string, updated: string): number | null {
  if (original === updated) return null;

  const before = original.split("\n");
  const after = updated.split("\n");
  const shared = Math.min(before.length, after.length);

  let index = 0;
  while (index < shared && before[index] === after[index]) index++;

  // Lines are 1-based. When the only change is that the end was cut off, the scan runs out with everything
  // it saw matching: there is no changed line in the new file, so point at its last one - which is exactly
  // where the merge view draws what was removed.
  return Math.min(index + 1, Math.max(after.length, 1));
}
