/**
 * The five steps of how the app works, as the new landing page tells them: their words, the app's own screens each one
 * plays (BuildScenes' scenes, by index, with each scene's length), and the small store the app window reads its
 * moment from.
 *
 * Handles: the copy - every step names something the app does today, in the words BuildScenes and the old build
 * orbit already used for it - which of the app's screens a step plays and for how long, turning a step's progress
 * into the screen and the moment on it (sceneFor; the last step plays the change and then the reloaded preview, in
 * the shares CHANGE_SHARE sets), and a ticker the window subscribes to, set from the scroll and rounded to TICK_MS so
 * the window's screen re-renders at most about twenty-five times a second however fast the page scrolls. It is a
 * module of its own so the components that read it stay hot-reloadable.
 */
export interface StoryScene {
  index: number;
  ms: number;
}

export interface StoryStep {
  name: string;
  title: string;
  detail: string;
  scenes: StoryScene[];
}

const CHANGE_SHARE = 0.62;
const TICK_MS = 40;

export const STORY: StoryStep[] = [
  { name: "Describe", title: "Say what you want", detail: "Type the idea the way you'd tell a friend.", scenes: [{ index: 0, ms: 5000 }] },
  { name: "Interview", title: "Answer four questions", detail: "Tailored to your idea, then compiled into a brief.", scenes: [{ index: 1, ms: 7600 }] },
  { name: "Build", title: "Watch every file land", detail: "Each file streams into the project as it is written.", scenes: [{ index: 2, ms: 7000 }] },
  { name: "Live", title: "Open it, running", detail: "A real dev server boots in its own sandboxed pod.", scenes: [{ index: 3, ms: 6200 }] },
  {
    name: "Change",
    title: "Ask for a change",
    detail: "It plans, edits the files and reloads the preview.",
    scenes: [
      { index: 4, ms: 6800 },
      { index: 5, ms: 5200 },
    ],
  },
];

export const LAST_SCENE = Math.max(...STORY.flatMap((step) => step.scenes.map((scene) => scene.index)));

export const STORY_MS = STORY.reduce((sum, step) => sum + step.scenes.reduce((total, scene) => total + scene.ms, 0), 0);

export function sceneFor(step: number, fraction: number) {
  const { scenes } = STORY[step];
  if (scenes.length === 1) return { scene: scenes[0].index, t: fraction * scenes[0].ms };
  if (fraction < CHANGE_SHARE) return { scene: scenes[0].index, t: (fraction / CHANGE_SHARE) * scenes[0].ms };
  return { scene: scenes[1].index, t: ((fraction - CHANGE_SHARE) / (1 - CHANGE_SHARE)) * scenes[1].ms };
}

export function stepOnClock(elapsed: number) {
  let rest = ((elapsed % STORY_MS) + STORY_MS) % STORY_MS;
  for (let index = 0; index < STORY.length; index++) {
    const length = STORY[index].scenes.reduce((total, scene) => total + scene.ms, 0);
    if (rest < length) return { index, fraction: rest / length };
    rest -= length;
  }
  return { index: STORY.length - 1, fraction: 1 };
}

export interface Moment {
  step: number;
  scene: number;
  t: number;
}

export function createTicker() {
  let moment: Moment = { step: 0, scene: 0, t: 0 };
  const listeners = new Set<() => void>();
  return {
    get: () => moment,
    set(step: number, scene: number, t: number) {
      const rounded = Math.round(t / TICK_MS) * TICK_MS;
      if (moment.step === step && moment.scene === scene && moment.t === rounded) return;
      moment = { step, scene, t: rounded };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type Ticker = ReturnType<typeof createTicker>;
