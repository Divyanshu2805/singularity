/**
 * What the landing page's replicas of the app (AppReplica.tsx) share that is not a component: the timing helpers
 * their scripts are written with, and the small data both the pieces and the scripts read.
 *
 * Handles: turning a clock into progress (span, eased by ease), into typed text (typed), into a yes or no (between)
 * and into whichever cue is in force (at - the last cue whose time has passed, which is how a script names the
 * camera's shot and the pointer's target for each moment); revealing code as it streams into an editor (streamed,
 * by share of its characters, and whole for a file already written); the editor's line height; and the three people
 * the share panel and the project header show.
 *
 * It is a module of its own so that AppReplica exports components only, which is what keeps it hot-reloadable.
 */
export type CodeLine = { text: string; tone?: "add" | "del" | "pick" | "flash"; n?: number | string; note?: string };

export const LINE_H = 23;

export const PEOPLE = [
  { name: "Asha Rao", email: "asha@runclub.dev" },
  { name: "Marco Ruiz", email: "marco@club.dev" },
  { name: "Sam Kim", email: "sam@club.dev" },
];

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const span = (t: number, start: number, length: number) => clamp01((t - start) / length);
export const ease = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
export const typed = (text: string, t: number, start: number, perChar = 34) => text.slice(0, Math.max(0, Math.floor((t - start) / perChar)));
export const between = (t: number, start: number, end: number) => t >= start && t < end;

export function at<T>(t: number, cues: readonly (readonly [number, T])[]): T {
  let value = cues[0][1];
  for (const [time, next] of cues) {
    if (t < time) break;
    value = next;
  }
  return value;
}

export function streamed(code: string[], progress: number): CodeLine[] {
  let budget = Math.floor(progress * code.reduce((sum, line) => sum + line.length + 1, 0));
  const lines: CodeLine[] = [];
  for (const line of code) {
    if (budget <= 0) break;
    lines.push({ text: line.slice(0, budget) });
    budget -= line.length + 1;
  }
  return lines;
}

export const whole = (code: string[]): CodeLine[] => code.map((text) => ({ text }));
