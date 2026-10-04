/**
 * The five steps of "How it works" - describe, answer, build, run, change - and the films each one plays.
 *
 * Handles: the steps' copy and icons, which of BuildScenes' films a step plays and for how long (a step is one film,
 * or two played back to back: "Change" is the request being made and then the running app with the change in it),
 * how long each step lasts in all, and finding the film and the time within it for a moment part-way through a step.
 * Both tellings of the section read this one list: the orbit a wide screen gets (StepOrbit) and the flat list
 * everything else gets (StepList), so the two can never say different things.
 *
 * The interview step says "a few questions": the app asks two, three or four depending on how much the idea already
 * says, and the earlier copy's "four" was only its upper bound. ExplainLLM, the first landing page's seventh step, is
 * not here - it has a section of its own (Understand).
 */
import { Code2, Eye, ListChecks, MessageSquareText, Wand2, type LucideIcon } from "lucide-react";

export type Film = { scene: number; duration: number };
export type Step = { label: string; title: string; detail: string; icon: LucideIcon; films: Film[] };

export const STEPS: Step[] = [
  { label: "Describe", title: "Say what you want", detail: "Type the idea the way you'd say it to a friend.", icon: MessageSquareText, films: [{ scene: 0, duration: 5000 }] },
  { label: "Answer", title: "A few quick questions", detail: "Written for your idea, then turned into a brief.", icon: ListChecks, films: [{ scene: 1, duration: 7600 }] },
  { label: "Build", title: "Every file, streamed", detail: "A checklist ticks off as each file is written.", icon: Code2, films: [{ scene: 2, duration: 7000 }] },
  { label: "Run", title: "Live in its own sandbox", detail: "A real dev server boots and you click the actual app.", icon: Eye, films: [{ scene: 3, duration: 6200 }] },
  {
    label: "Change",
    title: "Ask for what's next",
    detail: "It edits the files and the running app updates.",
    icon: Wand2,
    films: [
      { scene: 4, duration: 6800 },
      { scene: 5, duration: 5200 },
    ],
  },
];

export const SPANS = STEPS.map((step) => step.films.reduce((sum, film) => sum + film.duration, 0));

export const firstScene = (step: number) => STEPS[step].films[0].scene;
export const lastScene = (step: number) => STEPS[step].films[STEPS[step].films.length - 1].scene;

export function filmAt(step: number, fraction: number) {
  const films = STEPS[step].films;
  let time = Math.min(1, Math.max(0, fraction)) * SPANS[step];
  for (const film of films) {
    if (time < film.duration) return { scene: film.scene, time };
    time -= film.duration;
  }
  const last = films[films.length - 1];
  return { scene: last.scene, time: last.duration };
}
