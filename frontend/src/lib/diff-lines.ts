/**
 * Where a file's changes start.
 *
 * Handles: finding the first line two versions stop agreeing on, which is what turning the diff on scrolls to. When
 * the only change is that the end was cut off, it points at the new file's last line - exactly where the editor draws
 * what was removed.
 *
 * Deliberately a common-prefix scan rather than a real diff: the editor already renders the full diff against the
 * same baseline, and the first line a proper algorithm would call changed is that same line whatever it does after
 * it. A second, differently-tuned diff implementation could disagree with what is painted on screen; this cannot.
 */
export function firstChangedLine(original: string, updated: string): number | null {
  if (original === updated) return null;

  const before = original.split("\n");
  const after = updated.split("\n");
  const shared = Math.min(before.length, after.length);

  let index = 0;
  while (index < shared && before[index] === after[index]) index++;

  return Math.min(index + 1, Math.max(after.length, 1));
}
