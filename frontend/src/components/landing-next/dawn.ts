/**
 * The new landing page's opening, beat by beat, on the page's intro clock (landing/intro.ts).
 *
 * Handles: the moments the hero is made in - the planet's limb drawing its line of light outwards from under the
 * moon, the ring of totality brightening, the corona reaching out, the headline's words dropping in, the navigation
 * coming down and the prompt rising - as phases in milliseconds on the one clock every piece reads, so the light in
 * the shader and the DOM's entrances keep in step. The sky's own fade (INTRO.sky) comes first and is the sky's.
 *
 * Every phase ends before INTRO.end, the clock's own finish, so hurrying the opening (a scroll or a key) and skipping
 * it (a restored scroll position) land every piece on its resting state together. It is a module of its own so the
 * components that read it stay hot-reloadable.
 */
export const DAWN = {
  limb: { at: 200, for: 1300 },
  ring: { at: 480, for: 900 },
  corona: { at: 720, for: 1700 },
  headline: { at: 950, for: 1000 },
  wordStep: 55,
  nav: { at: 1200, for: 900 },
  navStep: 50,
  prompt: { at: 1500, for: 950 },
} as const;
