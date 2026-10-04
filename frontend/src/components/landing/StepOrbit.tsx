/**
 * How it works, as an orbit: the five steps set round a dark planet with the project window at its centre, lit by a
 * comet that falls as the visitor scrolls, strikes the top of the planet and sends its light running round the rim.
 *
 * Handles, all of it from the scroll position: the planet coming up into view whole, with the window in it and the
 * step cards flying out of the window to their places on the ring; a comet (comet.ts) coming down out of the sky
 * above it while the page scrolls, to land on the top of the rim just as the planet reaches the upper part of the
 * screen; a short bloom of light where it lands; and from that moment the light running clockwise round the rim
 * (orbitRay.ts), each step's films playing in the window while the light crosses that step's fifth of the ring, the
 * step's card lit, a ring filling round its badge and its small diagram playing along, earlier steps ticked. As the
 * light sets off the view closes in and moves on to each step's card in turn, the page held still (the navigation slides away
 * meanwhile, data-orbit-pinned on <html>); when the ring has closed the view draws back out to the whole planet and
 * the page moves on. Scrolling back up rewinds every part of it, the comet included, since each is a pure function
 * of how far the visitor has scrolled.
 *
 * This is the first landing page's build orbit (BuildOrbit) brought to the home page at the owner's request, with
 * two things changed. It has the home page's five steps (how-steps.ts), not seven. And its light has a different
 * origin: there, a second planet's rim above the heading poured a beam down onto the window; here the owner asked
 * for "a star or comet" that "hits the planet while falling and scrolling generating the round light rotating
 * effect". So the top of the ring is left clear for it to land on: the cards stand half a step round from where
 * they did, one in the middle of each fifth, and the light passes behind a step's card half-way through that step.
 * The window no longer waits at the top and sinks to the centre, since nothing lands on it now.
 *
 * The sizes are worked out from the screen, not fixed, at the owner's request: "increase the size of the planets and
 * cards ... max you can ... adjustable for all screens ... for each step the corresponding card and complete center
 * animation should be visible. Its okay for other cards getting cut". So the orbit is laid out once in units of its
 * own - the window at its design size in the middle, each card (CARD_SCALE of its design size) on the line from the
 * centre out through its place on the ring, as close to the window as GAP allows, and the planet just large enough
 * to hold the window with its corners RIM_CLEAR short of the rim - and then shown at the largest zoom at which, for
 * every step, the whole window and that step's card fit the screen together (never more than MAX_ZOOM, so a very
 * large screen is not filled with a window out of scale with the rest of the page). The zoom is the same for every
 * step, so nothing changes size as the light goes round, and the other cards are left to run off the edges. Before
 * this the ring's radius came from the screen's height, the cards stood on the ring itself and the view followed the
 * light freely: the card below the window stood so far from it that the two could not be on screen together, and the
 * window was cut.
 *
 * The view travels with the light as the visitor scrolls: it looks FOLLOW of the way from the window towards the
 * point on the rim the light has reached, held to wherever keeps the whole window and the step's card on screen, so
 * it goes round the window as the light goes round the planet. Towards the boundary between two steps (within
 * HANDOVER of a step) it is held to what both steps allow, so both their cards are on screen as one hands over to the
 * next and the view never jumps. For a while it only moved as far as each step's card required, which on a wide
 * screen was hardly at all, and the owner asked why the zoom had stopped working and for it to "rotate with
 * scrolling".
 *
 * The owner then asked for the window a little larger, the cards a little smaller and more room between them. The
 * three share the screen's height where a card stands above or below the window, so the room was found by pinning
 * the orbit to the very top of the screen and to its whole height, and by letting the lit card grow less (LIFT).
 *
 * The comet lands as the orbit pins. Until then the planet is shown small enough for all of it to fit the screen
 * (the zoom times the layout's "whole") and is held low in the view - its top HIT_LINE of the way down the screen,
 * or higher if that is what it takes to keep the whole window on screen - so the comet has sky to fall through and
 * the first step is in full view from its first moment; the view closes in once the light sets off, and at the end
 * draws back to the whole planet, centred. At the zoom the planet is larger than the screen: with its top where a
 * falling comet can be seen to reach it, the window at its centre was below the bottom of the screen, and the first
 * step played out of sight. The comet landed before the pin at first, and most of the first step then played while
 * the orbit was still coming up the screen, with the window cut. The comet has FALL_SCROLL of scroll to come down in
 * (1.2 screens where it first had 0.75, at the owner's request), and the cards' flight out of the window has a
 * stretch of its own (ASSEMBLE_SCROLL), ending as the comet lands: tied to the comet's fall it was over before the
 * planet had come onto the screen.
 *
 * The rim is painted with the gold ramp the comet is painted with (glsl.ts), so the light on the planet is the colour
 * of what lit it: with the first page's ramp the rim glowed orange under a yellow comet, and the owner asked why. Its
 * atmosphere comes up over RIM_START from the point of impact; the comet is told the planet's size on screen so the
 * light it leaves can run along the rim's own curve.
 *
 * The light's canvas reaches GLOW_BLEED past the orbit's box so the glow is never cut off, and is drawn at RAY_SHARP
 * of the zoom so the rim stays a fine line however far in the view is, short of RAY_BUDGET pixels of shader a frame;
 * the zoom is CSS zoom
 * rather than a transform, and the whole-planet view a scale down from it, so text stays sharp; and the pinned box
 * clips horizontally only, as does the section round it, because pinning relies on position: sticky and no ancestor
 * may clip with overflow: hidden. There is no guide line sketching the path: the planet is shown only by its dark
 * body, and its rim as the light reaches it.
 *
 * Per-frame values - where each card and the view are, how much of the rim is lit, where the comet is, how far
 * through the step the visitor is (the --step custom property the diagrams and progress marks read) - are written
 * straight to the DOM from one animation-frame loop that runs only while the orbit is near the screen; React
 * re-renders only when the step or the film changes, plus the film itself as its time moves. Without WebGL the rim is
 * drawn as a plain stroke instead. This is for a wide screen with motion allowed; anything else gets StepList.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuildScene } from "./BuildScenes";
import { createComet, type Comet } from "./comet";
import { GOLD_RAMP_GLSL } from "./glsl";
import { STEPS, filmAt, firstScene, type Step } from "./how-steps";
import { useInView } from "./motion";
import { createOrbitRay, shapeLength, shapePath, shapePoint, type OrbitRay, type Shape } from "./orbitRay";

const NODE_W = 256;
const NODE_H = 176;
const CARD_SCALE = 0.6;
const LIFT = 1.03;
const GAP = 26;
const RIM_CLEAR = 6;
const TOP_ROOM = 46;
const FOOT_ROOM = 30;
const VIEW_MARGIN = 6;
const LANDING_ROOM = 0.04;
const FOLLOW = 0.5;
const HANDOVER = 0.12;
const MAX_ZOOM = 3;
const RIM_START = 170;
const GLOW_BLEED = 100;
const STICKY_TOP = 0;
const RAY_SHARP = 0.78;
const RAY_BUDGET = 2500000;
const DESIGN = { w: 500, h: 340 };
const DESIGN_WIDTH = 1280;
const MIN_DESIGN = 0.45;
const ENTER_LINE = 0.62;
const HIT_LINE = 0.36;
const MIN_HIT_LINE = 0.18;
const FALL_SCROLL = 1.2;
const ASSEMBLE_SCROLL = 0.62;
const ASSEMBLED = 0.85;
const CLOSE_IN_SCROLL = 0.3;
const STEP_SCROLL = 0.42;
const OUTRO_SCROLL = 0.32;
const SPENT_SCROLL = 0.09;
const FLASH_RISE = 0.015;
const FLASH_FADE = 0.14;
const FALL_EASE = 1.6;
const SIGHT = "30% 0px 70% 0px";
const TURN = Math.PI * 2;

type Point = { x: number; y: number };
type Range = { low: Point; high: Point };
type Phase = "waiting" | "running" | "finished";
type Layout = {
  w: number;
  h: number;
  shape: Shape;
  total: number;
  path: string;
  zoom: number;
  whole: number;
  nodes: Point[];
  ranges: Range[];
  meets: Range[];
  ground: Point;
  window: Point;
  impact: Point;
  pinned: number;
  lead: number;
  assemble: number;
  fall: number;
  hit: number;
  closeIn: number;
  span: number;
  outro: number;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ease = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const glide = (value: number) => {
  const at = clamp01(value);
  return at * at * at * (at * (at * 6 - 15) + 10);
};

function overlap(one: Range, other: Range): Range {
  const axis = (low: number, high: number) => (low <= high ? [low, high] : [(low + high) / 2, (low + high) / 2]);
  const [lowX, highX] = axis(Math.max(one.low.x, other.low.x), Math.min(one.high.x, other.high.x));
  const [lowY, highY] = axis(Math.max(one.low.y, other.low.y), Math.min(one.high.y, other.high.y));
  return { low: { x: lowX, y: lowY }, high: { x: highX, y: highY } };
}

function orbitLayout(viewW: number, viewport: number): Layout {
  const pinned = viewport - STICKY_TOP;
  const radius = Math.hypot(DESIGN.w / 2, DESIGN.h / 2) + RIM_CLEAR;
  const card = { w: NODE_W * CARD_SCALE, h: NODE_H * CARD_SCALE };
  const reach = { x: DESIGN.w / 2 + GAP + card.w / 2, y: DESIGN.h / 2 + GAP + card.h / 2 };
  const offsets = STEPS.map((_, index) => {
    const angle = ((index + 0.5) / STEPS.length) * TURN;
    const across = Math.sin(angle);
    const up = -Math.cos(angle);
    const out = Math.min(reach.x / Math.max(Math.abs(across), 1e-6), reach.y / Math.max(Math.abs(up), 1e-6));
    return { x: across * out, y: up * out };
  });
  const spans = offsets.map((offset) => ({
    left: Math.min(-DESIGN.w / 2, offset.x - (card.w * LIFT) / 2),
    right: Math.max(DESIGN.w / 2, offset.x + (card.w * LIFT) / 2),
    top: Math.min(-DESIGN.h / 2, offset.y - (card.h * LIFT) / 2),
    bottom: Math.max(DESIGN.h / 2, offset.y + (card.h * LIFT) / 2),
  }));
  const room = { x: viewW - 2 * VIEW_MARGIN, y: pinned - 2 * VIEW_MARGIN };
  const zoom = Math.min(MAX_ZOOM, ...spans.map((span) => Math.min(room.x / (span.right - span.left), room.y / (span.bottom - span.top))));
  const half = { x: room.x / 2 / zoom, y: room.y / 2 / zoom };
  const w = viewW / zoom;
  const h = TOP_ROOM + 2 * radius + FOOT_ROOM;
  const cx = w / 2;
  const cy = TOP_ROOM + radius;
  const breadth = 2 * (Math.max(...offsets.map((offset) => Math.abs(offset.x))) + card.w / 2);
  const whole = Math.min(1, room.y / h / zoom, room.x / breadth / zoom);
  const shape = { cx, cy, ex: 0, ey: 0, c: radius };
  const lead = Math.max(0, viewport * ENTER_LINE - STICKY_TOP);
  const landing = Math.max(MIN_HIT_LINE * viewport, Math.min(HIT_LINE * viewport, viewport * (1 - LANDING_ROOM) - whole * zoom * (radius + DESIGN.h / 2)));
  const ranges = spans.map((span) => ({
    low: { x: cx + Math.min(span.right - half.x, span.left + half.x), y: cy + Math.min(span.bottom - half.y, span.top + half.y) },
    high: { x: cx + span.left + half.x, y: cy + span.top + half.y },
  }));
  const hit = Math.round(lead);
  return {
    w,
    h,
    zoom,
    whole,
    shape,
    total: shapeLength(shape),
    path: shapePath(shape),
    nodes: offsets.map((offset) => ({ x: cx + offset.x, y: cy + offset.y })),
    ranges,
    meets: ranges.slice(1).map((range, index) => overlap(ranges[index], range)),
    ground: { x: cx, y: cy - radius + (pinned / 2 - (landing - STICKY_TOP)) / (whole * zoom) },
    window: { x: cx, y: cy },
    impact: { x: cx, y: cy - radius },
    pinned,
    lead,
    assemble: hit - Math.round(viewport * ASSEMBLE_SCROLL),
    fall: hit - Math.round(viewport * FALL_SCROLL),
    hit,
    closeIn: Math.round(viewport * CLOSE_IN_SCROLL),
    span: Math.round(STEPS.length * STEP_SCROLL * viewport),
    outro: Math.round(OUTRO_SCROLL * viewport),
  };
}

function byProgress(progress: number) {
  const at = clamp01(progress) * STEPS.length;
  const index = Math.min(STEPS.length - 1, Math.floor(at));
  return { index, fraction: at - index };
}

function createTicker() {
  let value = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: number) {
      if (next === value) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

type Ticker = ReturnType<typeof createTicker>;

function SceneRunner({ scene, ticker }: { scene: number; ticker: Ticker }) {
  const time = useSyncExternalStore(ticker.subscribe, ticker.get);
  return <BuildScene index={scene} t={time} />;
}

const seg = (k: number) => ({ "--k": k }) as CSSProperties;

function StepGlyph({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="glyph-box flex items-center gap-1.5 px-2 text-[10px]">
        <span className="text-primary">›</span>
        <span className="glyph-type truncate text-foreground/85">A habit tracker for my club</span>
        <span className="glyph-caret" />
      </div>
    );
  }
  if (index === 1) {
    return (
      <div className="flex h-[20px] items-center gap-1">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className="glyph-track h-1.5 flex-1" style={seg(k)}>
            <span className="glyph-fill glyph-fill-4" />
          </span>
        ))}
        <span className="glyph-pop ml-1 text-[10px] text-primary" style={seg(3.6)}>
          brief.md
        </span>
      </div>
    );
  }
  if (index === 2) {
    return (
      <div className="flex h-[20px] flex-col justify-center gap-[3px]">
        {[0, 1, 2].map((k) => (
          <span key={k} className="glyph-track h-[3px]" style={{ ...seg(k), width: `${100 - k * 18}%` }}>
            <span className="glyph-fill glyph-fill-3" />
          </span>
        ))}
      </div>
    );
  }
  if (index === 3) {
    return (
      <div className="glyph-box flex items-center gap-1.5 px-2 text-[10px] text-muted-foreground">
        <span className="glyph-track h-1 flex-1" style={seg(0)}>
          <span className="glyph-fill glyph-fill-1" />
        </span>
        <span className="glyph-live flex items-center gap-1 text-[hsl(152_58.5%_57.5%)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[hsl(156_64%_48.8%)] shadow-[0_0_6px_hsl(156_64%_48.8%)]" /> Live
        </span>
      </div>
    );
  }
  return (
    <div className="flex h-[20px] items-center gap-1.5 text-[10px]">
      <span className="glyph-pop truncate rounded-md rounded-br-sm bg-white/[0.07] px-2 py-0.5 text-foreground/85" style={seg(0.2)}>
        Add a weekly chart
      </span>
      <Check className="glyph-pop h-3 w-3 shrink-0 text-[hsl(151_52.1%_56%)]" style={seg(3.2)} />
    </div>
  );
}

function Badge({ step, active, done }: { step: Step; active: boolean; done: boolean }) {
  const Icon = step.icon;
  return (
    <span
      className={cn(
        "orbit-badge relative grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-colors duration-500",
        active ? "border-primary/70 bg-primary/15 text-primary" : done ? "border-[hsl(151_52.1%_56%/0.5)] text-[hsl(151_52.1%_56%)]" : "border-white/10 text-muted-foreground"
      )}
    >
      {done && !active ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
      {active && (
        <svg aria-hidden="true" viewBox="0 0 40 40" className="absolute -inset-[5px] h-[38px] w-[38px] -rotate-90">
          <circle cx="20" cy="20" r="18" pathLength={100} className="orbit-progress" />
        </svg>
      )}
    </span>
  );
}

type CardProps = {
  index: number;
  step: Step;
  active: boolean;
  done: boolean;
  place: Point;
  tucked: string;
  nodeRef: (node: HTMLLIElement | null) => void;
};

function CardNode({ index, step, active, done, place, tucked, nodeRef }: CardProps) {
  return (
    <li
      ref={nodeRef}
      data-active={active}
      data-done={done && !active}
      className="orbit-node absolute"
      style={{ left: place.x, top: place.y, width: NODE_W, height: NODE_H, opacity: 0, transform: tucked }}
    >
      <div className="orbit-card relative flex h-full flex-col overflow-hidden rounded-[18px] border px-4 pb-3 pt-3.5 backdrop-blur-xl">
        <span aria-hidden="true" className="orbit-number pointer-events-none absolute -right-1 -top-4 font-display text-[76px] font-semibold leading-none">
          0{index + 1}
        </span>
        <div className="relative flex items-center gap-2.5">
          <Badge step={step} active={active} done={done} />
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/80">{step.label}</span>
          <span className="ml-auto font-mono text-[10.5px] tabular-nums tracking-[0.12em] text-muted-foreground/70">
            <span className="text-primary/90">0{index + 1}</span> / 0{STEPS.length}
          </span>
        </div>
        <p className="relative mt-2.5 font-display text-[19px] font-semibold leading-tight tracking-tight">{step.title}</p>
        <p className="orbit-detail relative mt-1.5 text-[12px] leading-[1.5]">{step.detail}</p>
        <div className="orbit-glyph relative mt-auto pt-2.5">
          <StepGlyph index={index} />
        </div>
      </div>
    </li>
  );
}

export function StepOrbit() {
  const ids = useId().replace(/:/g, "");
  const [rootRef, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0, rootMargin: SIGHT });
  const [layout, setLayout] = useState<Layout | null>(null);
  const [shown, setShown] = useState<{ index: number; scene: number; phase: Phase }>({ index: 0, scene: firstScene(0), phase: "waiting" });
  const [ticker] = useState(createTicker);
  const [rayFailed, setRayFailed] = useState(false);
  const last = useRef(shown);
  const trailRef = useRef<SVGPathElement>(null);
  const rayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rayRef = useRef<OrbitRay | null>(null);
  const cometCanvasRef = useRef<HTMLCanvasElement>(null);
  const cometRef = useRef<Comet | null>(null);
  const impactRef = useRef<HTMLSpanElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const shrinkRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    let size = "";
    const measure = () => {
      const next = `${node.clientWidth}x${window.innerHeight}`;
      if (next === size) return;
      size = next;
      setLayout(orbitLayout(node.clientWidth, window.innerHeight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rootRef]);

  useEffect(() => {
    const canvas = rayCanvasRef.current;
    if (!canvas || !layout) return;
    const ray = createOrbitRay(canvas, GOLD_RAMP_GLSL, RIM_START);
    if (!ray) {
      setRayFailed(true);
      return;
    }
    const design = Math.min(1, Math.max(MIN_DESIGN, Math.min(window.innerWidth, 2100) / DESIGN_WIDTH));
    const wide = layout.w + 2 * GLOW_BLEED;
    const tall = layout.h + 2 * GLOW_BLEED;
    const density = Math.max(1, Math.min(layout.zoom * RAY_SHARP, Math.sqrt(RAY_BUDGET / (wide * tall))));
    ray.resize(wide, tall, { ...layout.shape, cx: layout.shape.cx + GLOW_BLEED, cy: layout.shape.cy + GLOW_BLEED }, density, layout.zoom, design);
    ray.draw(0, 0, 0, 4);
    rayRef.current = ray;
    return () => {
      rayRef.current = null;
      ray.dispose();
    };
  }, [layout]);

  useEffect(() => {
    const canvas = cometCanvasRef.current;
    if (!canvas) return;
    const comet = createComet(canvas);
    if (!comet) return;
    comet.resize();
    cometRef.current = comet;
    window.addEventListener("resize", comet.resize);
    return () => {
      window.removeEventListener("resize", comet.resize);
      cometRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!visible || !layout) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const camera = { x: 0, y: 0, ready: false };
    const written = new WeakMap<Element, Record<string, string>>();
    const write = (element: HTMLElement | SVGElement | null, key: string, value: string) => {
      if (!element) return;
      const values = written.get(element) ?? {};
      if (values[key] === value) return;
      values[key] = value;
      written.set(element, values);
      element.style.setProperty(key, value);
    };

    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick);
      const viewport = window.innerHeight;
      const since = viewport * ENTER_LINE - root.getBoundingClientRect().top;
      const after = since - layout.hit;
      const intro = clamp01((since - layout.assemble) / ((layout.hit - layout.assemble) * ASSEMBLED));
      const progress = clamp01(after / layout.span);
      const outro = clamp01((after - layout.span) / layout.outro);
      const phase: Phase = after < 0 ? "waiting" : progress >= 1 ? "finished" : "running";
      const position = phase === "finished" ? { index: STEPS.length - 1, fraction: 1 } : byProgress(progress);
      const film = filmAt(position.index, position.fraction);
      if (position.index !== last.current.index || film.scene !== last.current.scene || phase !== last.current.phase) {
        last.current = { index: position.index, scene: film.scene, phase };
        setShown(last.current);
      }
      ticker.set(Math.round(film.time / 40) * 40);
      write(root, "--step", position.fraction.toFixed(3));

      const pinned = since >= 0 && after < layout.span + layout.outro + 40 ? "true" : "false";
      if (document.documentElement.dataset.orbitPinned !== pinned) document.documentElement.dataset.orbitPinned = pinned;

      layout.nodes.forEach((node, index) => {
        const out = ease((intro - 0.08 - index * 0.075) / 0.4);
        const lift = phase === "running" && index === position.index ? LIFT : 1;
        const element = nodeRefs.current[index];
        write(
          element,
          "transform",
          `translate(-50%, -50%) translate(${((layout.window.x - node.x) * (1 - out)).toFixed(1)}px, ${((layout.window.y - node.y) * (1 - out)).toFixed(1)}px) scale(${((0.3 + 0.7 * out) * lift * CARD_SCALE).toFixed(3)})`
        );
        write(element, "opacity", clamp01(out * 3).toFixed(3));
      });

      rayRef.current?.draw(progress, phase === "running" ? 1 : 0, ease(intro / 0.6), time / 1000);
      write(trailRef.current, "stroke-dasharray", `${(progress * layout.total).toFixed(1)} ${layout.total.toFixed(1)}`);

      const open = 1 - glide(after / layout.closeIn);
      const close = ease(outro);
      const scale = 1 - (1 - layout.whole) * Math.max(open, close);
      write(shrinkRef.current, "transform", `scale(${scale.toFixed(4)})`);

      const head = shapePoint(layout.shape, progress);
      const want = { x: layout.window.x + (head.x - layout.window.x) * FOLLOW, y: layout.window.y + (head.y - layout.window.y) * FOLLOW };
      const towards = position.fraction < 0.5 ? -1 : 1;
      const next = position.index + towards;
      const edge = towards < 0 ? position.fraction : 1 - position.fraction;
      const share = next < 0 || next >= STEPS.length ? 0 : 1 - glide(edge / HANDOVER);
      const own = layout.ranges[position.index];
      const both = share > 0 ? layout.meets[Math.min(position.index, next)] : own;
      const low = { x: own.low.x + (both.low.x - own.low.x) * share, y: own.low.y + (both.low.y - own.low.y) * share };
      const high = { x: own.high.x + (both.high.x - own.high.x) * share, y: own.high.y + (both.high.y - own.high.y) * share };
      const view = { x: clamp(want.x, low.x, high.x), y: clamp(want.y, low.y, high.y) };
      const focus = {
        x: view.x + (layout.ground.x - view.x) * open + (layout.w / 2 - view.x) * close,
        y: view.y + (layout.ground.y - view.y) * open + (layout.h / 2 - view.y) * close,
      };
      const target = { x: root.clientWidth / 2 - focus.x * layout.zoom, y: layout.pinned / 2 - focus.y * layout.zoom };
      if (!camera.ready || phase === "waiting") Object.assign(camera, target, { ready: true });
      camera.x += (target.x - camera.x) * 0.12;
      camera.y += (target.y - camera.y) * 0.12;
      write(cameraRef.current, "transform", `translate(${camera.x.toFixed(1)}px, ${camera.y.toFixed(1)}px)`);

      const fall = clamp01((since - layout.fall) / (layout.hit - layout.fall));
      const spent = clamp01(after / (viewport * SPENT_SCROLL));
      const rise = viewport * FLASH_RISE;
      const flash = after < 0 ? 0 : Math.min(1, after / rise) * Math.exp(-Math.max(0, after - rise) / (viewport * FLASH_FADE));
      const mark = impactRef.current;
      if (mark && fall > 0 && (spent < 1 || flash > 0.004)) {
        const at = mark.getBoundingClientRect();
        cometRef.current?.draw(Math.pow(fall, FALL_EASE), spent, flash, { x: at.left, y: at.top }, layout.shape.c * layout.zoom * scale, time / 1000);
      } else {
        cometRef.current?.clear();
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      cometRef.current?.clear();
      document.documentElement.dataset.orbitPinned = "false";
    };
  }, [visible, layout, ticker, rootRef]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.orbitPinned;
    };
  }, []);

  const running = shown.phase === "running";
  const finished = shown.phase === "finished";
  const current = STEPS[shown.index];
  const height = layout ? layout.pinned + layout.hit + layout.span + layout.outro - layout.lead : undefined;
  const tucked = (point: Point) =>
    layout ? `translate(-50%, -50%) translate(${(layout.window.x - point.x).toFixed(1)}px, ${(layout.window.y - point.y).toFixed(1)}px) scale(${(0.3 * CARD_SCALE).toFixed(3)})` : "";

  return (
    <div ref={rootRef} className="build-orbit relative" style={{ height: height ?? "100vh" }}>
      <canvas ref={cometCanvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-20 h-full w-full" style={{ mixBlendMode: "screen" }} />
      {layout && (
        <div className="sticky overflow-x-clip" style={{ top: STICKY_TOP, height: layout.pinned }}>
          <div ref={shrinkRef} className="h-full origin-center" style={{ transform: `scale(${layout.whole})` }}>
            <div ref={cameraRef} className="origin-top-left will-change-transform">
              <div className="relative" style={{ height: layout.h, width: layout.w, zoom: layout.zoom } as CSSProperties}>
                {rayFailed ? (
                  <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${layout.w} ${layout.h}`}>
                    <defs>
                      <mask id={`${ids}-trail`} maskUnits="userSpaceOnUse" x={-40} y={-40} width={layout.w + 80} height={layout.h + 80}>
                        <path ref={trailRef} d={layout.path} fill="none" stroke="white" strokeWidth={44} style={{ strokeDasharray: `0 ${layout.total}` }} />
                      </mask>
                    </defs>
                    <g mask={`url(#${ids}-trail)`}>
                      <path d={layout.path} className="orbit-ray orbit-ray-glow" />
                      <path d={layout.path} className="orbit-ray orbit-ray-body" />
                      <path d={layout.path} className="orbit-ray orbit-ray-core" />
                    </g>
                  </svg>
                ) : (
                  <canvas
                    ref={rayCanvasRef}
                    aria-hidden="true"
                    className="pointer-events-none absolute"
                    style={{ left: -GLOW_BLEED, top: -GLOW_BLEED, width: `calc(100% + ${2 * GLOW_BLEED}px)`, height: `calc(100% + ${2 * GLOW_BLEED}px)` }}
                  />
                )}
                <span ref={impactRef} aria-hidden="true" className="absolute" style={{ left: layout.impact.x, top: layout.impact.y, width: 0, height: 0 }} />

                <ol className="contents">
                  {STEPS.map((step, index) => (
                    <CardNode
                      key={step.label}
                      index={index}
                      step={step}
                      active={running && index === shown.index}
                      done={finished || (running && index < shown.index)}
                      place={layout.nodes[index]}
                      tucked={tucked(layout.nodes[index])}
                      nodeRef={(node) => {
                        nodeRefs.current[index] = node;
                      }}
                    />
                  ))}
                </ol>

                <div
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border/80 bg-card/95 font-mono shadow-[0_40px_90px_-30px_rgb(0_0_0/0.85),0_0_0_1px_hsl(var(--primary)/0.06)]"
                  style={{ left: layout.window.x, top: layout.window.y, width: DESIGN.w, height: DESIGN.h }}
                >
                  <div className="absolute left-0 top-0 flex origin-top-left flex-col" style={{ width: DESIGN.w, height: DESIGN.h }}>
                    <div className="flex items-center gap-3 border-b border-border/70 bg-panel/80 px-3.5 py-2.5">
                      <div className="terminal-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="truncate text-[11px] text-muted-foreground">running-club — Singularity</span>
                      <span key={shown.index} className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary animate-in fade-in zoom-in-95 duration-300">
                        0{shown.index + 1} · {current.label}
                      </span>
                    </div>
                    <span className="relative block h-[2px] bg-border/50">
                      <span className="orbit-bar absolute inset-0 origin-left bg-primary" />
                    </span>
                    <div key={shown.scene} className="min-h-0 flex-1 animate-in fade-in duration-300">
                      <SceneRunner scene={shown.scene} ticker={ticker} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
