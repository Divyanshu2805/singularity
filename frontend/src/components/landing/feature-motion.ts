/**
 * What the home page's features do as the page is scrolled: the wells the cards press into the sheet under them, the
 * ring each card sends out as it lands, and the light that follows the chapter being read.
 *
 * Handles: one loop for the section, running only while the section is near the screen, that reads where everything
 * stands and writes three things. The sheet (FeatureSheet): for every card a well whose depth follows the card's own
 * rise (scroll-rise.ts's riseMeasure and chase, the same measure and the same ease the card itself is moved by, so
 * the sheet gives way exactly as the card comes down onto it and springs back as the page is scrolled up), and a
 * ring that leaves the card's edge once it has landed and travels out as the page is scrolled on (lib/feature-sheet's
 * ringAlong) - both are functions of the scroll and of nothing else, which is what the owner asked for ("when I
 * scroll the animation of cards should behave as I scroll"). The light: each chapter (data-chapter) is fully lit
 * while it spans the middle of the screen and dims as it moves away (focusOf), written as opacity on its heading
 * (data-head) and as the strength of a black veil over each of its cards (data-veil, inside data-tile) - a card
 * dimmed by its own opacity went see-through and the grid showed across its words, and a brightness filter, which
 * looks the same as the veil, made every dimmed card a picture the browser had to filter on each frame; a card or
 * heading at full strength carries neither. The lead:
 * which chapter is the most lit (leadOf), reported to the section when it changes (onLead), since only the leading
 * chapter's films play.
 *
 * Two things here are on a spring and not on the scroll, because they answer something other than the scroll: the
 * card whose film is playing (playing) presses a little deeper than the others (TURN) and its lines come up a shade
 * more gold, so the sheet shows where the film is, and the card the pointer is held on (held) presses deeper still
 * (PRESS) and is lit whatever its chapter's light is. Both move on lib/spacetime's spring (WEIGHT_MS).
 *
 * Where each card and chapter stands is measured once and again whenever the section changes size, as offsets from
 * the section's top - the cells that hold the cards never move (Lift), only the pieces inside them do - so a frame
 * reads one rectangle, the section's. playing and held are refs the section keeps up to date, so a change of turn
 * does not restart the loop. Nothing here re-renders React except a change of lead. The section does not call this
 * on a narrow screen or under reduced motion (enabled), where the cards simply stand on the plain sky.
 */
import { useEffect, type MutableRefObject, type RefObject } from "react";
import { clamp01, dimOf, focusOf, landing, leadOf, ringAlong, ringStrength, wellOf } from "@/lib/feature-sheet";
import { sinkLimit, springTowards, type Spring } from "@/lib/spacetime";
import type { SheetHandle, Well } from "./FeatureSheet";
import { chase, riseMeasure } from "./scroll-rise";

const NEAR = "60% 0px 60% 0px";
const TURN = 0.4;
const PRESS = 0.55;
const REST_GLOW = 0.03;
const TURN_GLOW = 0.1;
const PRESS_GLOW = 0.07;
const OFF_FOCUS = 0.3;
const RING_REACH = 520;
const RING_PUSH = 9;
const RING_FLASH = 0.26;
const WEIGHT_MS = 900;
const WEIGHT_DAMPING = 0.72;
const DEEPEST = 0.9;
const LEAST_MEASURE = -1;
const MOST_MEASURE = 4;
const MOST_ELAPSED = 64;
const HOME = 1.02;

interface Card {
  veil: HTMLElement | null;
  cell: HTMLElement;
  chapter: number;
  order: number;
  top: number;
  depth: number;
  rim: number;
  measure: number;
  turn: Spring;
  press: Spring;
  shown: string;
  well: Well;
}

interface Block {
  node: HTMLElement;
  heads: HTMLElement[];
  top: number;
  bottom: number;
  focus: number;
  shown: string;
}

interface FeatureMotion {
  enabled: boolean;
  section: RefObject<HTMLElement>;
  sheet: RefObject<SheetHandle>;
  playing: MutableRefObject<number>;
  held: MutableRefObject<number>;
  onLead: (chapter: number) => void;
}

function light(node: HTMLElement, level: number) {
  const next = level >= 0.999 ? "" : level.toFixed(3);
  if (next) node.style.opacity = next;
  else node.style.removeProperty("opacity");
  return next;
}

function shade(veil: HTMLElement | null, level: number) {
  const next = level >= 0.999 ? "" : (1 - level).toFixed(3);
  if (next) veil?.style.setProperty("opacity", next);
  else veil?.style.removeProperty("opacity");
  return next;
}

export function useFeatureMotion({ enabled, section, sheet, playing, held, onLead }: FeatureMotion) {
  useEffect(() => {
    const root = section.current;
    if (!enabled || !root) return;

    const blocks: Block[] = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]"), (node) => ({
      node,
      heads: Array.from(node.querySelectorAll<HTMLElement>("[data-head]")),
      top: 0,
      bottom: 0,
      focus: Number.NaN,
      shown: "",
    }));
    const cards: Card[] = [];
    blocks.forEach((block, chapter) => {
      block.node.querySelectorAll<HTMLElement>("[data-tile]").forEach((tile) => {
        const cell = tile.closest<HTMLElement>("[data-lift]") ?? tile;
        cards.push({
          veil: tile.querySelector<HTMLElement>("[data-veil]"),
          cell,
          chapter,
          order: Number(cell.dataset.lift) || 0,
          top: 0,
          depth: 0,
          rim: 0,
          measure: Number.NaN,
          turn: { at: 0, speed: 0 },
          press: { at: 0, speed: 0 },
          shown: "",
          well: { x: 0, y: 0, reach: 1, depth: 0, glow: 0, ring: 0, push: 0, flash: 0, left: 0, top: 0, right: 0, bottom: 0, covered: false },
        });
      });
    });
    const wells = cards.map((card) => card.well);
    const focus = blocks.map(() => 0);
    let lead = -1;
    let frame = 0;
    let then = 0;

    const measure = () => {
      const box = root.getBoundingClientRect();
      blocks.forEach((block) => {
        const at = block.node.getBoundingClientRect();
        block.top = at.top - box.top;
        block.bottom = at.bottom - box.top;
      });
      cards.forEach((card) => {
        const at = card.cell.getBoundingClientRect();
        const shape = wellOf(at.width, at.height);
        card.top = at.top - box.top;
        card.depth = shape.depth;
        card.rim = shape.rim;
        card.well.x = at.left - box.left + at.width / 2;
        card.well.y = card.top + at.height / 2;
        card.well.reach = shape.reach;
        card.well.left = at.left - box.left;
        card.well.top = card.top;
        card.well.right = at.right - box.left;
        card.well.bottom = at.bottom - box.top;
      });
    };

    const step = (now: number) => {
      const elapsed = then ? Math.min(now - then, MOST_ELAPSED) : 16;
      const fresh = !then;
      then = now;
      const origin = root.getBoundingClientRect().top;
      const viewport = window.innerHeight;

      blocks.forEach((block, index) => {
        const goal = focusOf(origin + block.top, origin + block.bottom, viewport);
        block.focus = fresh ? goal : chase(block.focus, goal, elapsed);
        focus[index] = block.focus;
        const level = dimOf(block.focus);
        const next = level >= 0.999 ? "" : level.toFixed(3);
        if (next === block.shown) return;
        block.shown = next;
        block.heads.forEach((head) => light(head, level));
      });

      const next = leadOf(lead, focus);
      if (next !== lead) {
        lead = next;
        onLead(next);
      }

      cards.forEach((card, index) => {
        const goal = Math.min(MOST_MEASURE, Math.max(LEAST_MEASURE, riseMeasure(origin + card.top, card.order, viewport)));
        card.measure = fresh ? goal : chase(card.measure, goal, elapsed);
        springTowards(card.turn, playing.current === index ? 1 : 0, elapsed, WEIGHT_MS, WEIGHT_DAMPING);
        springTowards(card.press, held.current === index ? 1 : 0, elapsed, WEIGHT_MS, WEIGHT_DAMPING);

        const landed = landing(clamp01(card.measure));
        const lit = focus[card.chapter];
        const turn = clamp01(card.turn.at);
        const press = clamp01(card.press.at);
        const along = ringAlong(card.measure);
        const strength = ringStrength(along);
        const { well } = card;
        well.depth = Math.min(card.depth * landed * (1 + TURN * card.turn.at + PRESS * card.press.at), sinkLimit(well.reach) * DEEPEST);
        well.glow = landed * (REST_GLOW + TURN_GLOW * turn + PRESS_GLOW * press) * (OFF_FOCUS + (1 - OFF_FOCUS) * Math.max(lit, press));
        well.ring = card.rim + along * RING_REACH;
        well.push = RING_PUSH * strength;
        well.flash = RING_FLASH * strength;
        well.covered = card.measure >= HOME;

        const level = dimOf(Math.max(lit, press));
        const shown = level >= 0.999 ? "" : (1 - level).toFixed(3);
        if (shown !== card.shown) card.shown = shade(card.veil, level);
      });

      sheet.current?.paint(wells);
    };

    const tick = (now: number) => {
      frame = window.requestAnimationFrame(tick);
      step(now);
    };
    const start = () => {
      if (frame) return;
      then = 0;
      measure();
      frame = window.requestAnimationFrame(tick);
    };
    const stop = () => {
      window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const sizes = new ResizeObserver(() => {
      measure();
      if (!frame) return;
      then = 0;
    });
    sizes.observe(root);
    const sight = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), { rootMargin: NEAR });
    sight.observe(root);

    return () => {
      stop();
      sizes.disconnect();
      sight.disconnect();
      blocks.forEach((block) => block.heads.forEach((head) => head.style.removeProperty("opacity")));
      cards.forEach((card) => card.veil?.style.removeProperty("opacity"));
    };
  }, [enabled, section, sheet, playing, held, onLead]);
}
