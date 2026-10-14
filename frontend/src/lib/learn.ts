/**
 * What teaching mode keeps for a whole project: the tour and the glossary.
 *
 * Handles: cleaning a typed word the way the server does so the same word is the same entry everywhere, finding a
 * word's entry, and filtering the glossary by what is typed.
 *
 * The tour and a glossary entry are read with the same readers a big picture is (lib/lesson.ts), since they are the
 * same shape of text: an opening, then headed sections. A step's "try changing this" task, and the reading of its
 * task and its check, lived here until the owner had the task taken out; a lesson's "Check yourself" exercise does
 * that job now.
 */

const MAX_TERM_CHARS = 80;

export function cleanTerm(raw: string): string {
  const term = raw.replace(/[`*_\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  return term.length > MAX_TERM_CHARS ? term.slice(0, MAX_TERM_CHARS).trim() : term;
}

export const termKey = (term: string) => cleanTerm(term).toLowerCase();

export function findEntry<T extends { term: string }>(entries: readonly T[] | undefined, term: string | null): T | undefined {
  if (!entries || !term) return undefined;
  const key = termKey(term);
  return entries.find((entry) => termKey(entry.term) === key);
}

export function filterEntries<T extends { term: string }>(entries: readonly T[], query: string): T[] {
  const needle = termKey(query);
  return needle ? entries.filter((entry) => termKey(entry.term).includes(needle)) : [...entries];
}

export const NOT_A_TERM = "This isn't a programming word.";

export const isNotATerm = (definition: string) => definition.trim().startsWith(NOT_A_TERM);
