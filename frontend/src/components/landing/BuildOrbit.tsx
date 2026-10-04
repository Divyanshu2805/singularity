/**
 * The build orbit: the whole life of one project told as seven steps - describe, interview, build, preview, change,
 * the updated preview, and ExplainLLM - set round a path of light about a window that plays each step in turn.
 *
 * Handles: the window waiting alone at the top of the orbit, where the planet rim's beam (HorizonArc) lands on it; then, as the
 * visitor scrolls on from that moment, the steps coming out of the window one after another and flying out to their
 * places while a dark planet fills the ring and the window settles into its place; then the beam's light running on
 * round that planet's rim - orbitRay.ts, drawn with HorizonArc's own recipe so it reads as the same light - travelling
 * round the path and lighting it behind it. Each step's scene plays in the window
 * while the ray travels from that step to the next: it starts as the ray leaves the step and ends as the ray arrives at
 * the next. That step is lit, a ring fills round its badge and its small diagram plays along with the scene; earlier
 * steps show a tick and a finished diagram. A step's card says what the step is: its name and its place in the run,
 * a title, one line on what happens in it, and under a hairline the small diagram. The window itself shows the app's
 * own screens (BuildScenes, built from AppReplica), filmed by a camera that moves in on the part each step is about.
 *
 * On desktop the steps sit as seven cards on a circle round the window, shown ZOOM times as large as the circle that
 * fits the screen, with the view following the ray round it. The screen's height caps the circle's radius, so a card
 * that would touch the window slides straight out sideways, off the ring, just far enough to clear it
 * (clearOfWindow): the ring stays a true circle and the window keeps its size, up to WINDOW_LIMIT.
 *
 * On desktop all of it is driven by scroll, not time: from the beam's landing the orbit takes over the scroll and the
 * navigation bar slides away (the data-orbit-pinned attribute on <html>, read by index.css) so the orbit can pin near
 * the very top of the screen; once the ray has closed its path, the next OUTRO_SCROLL of a screen's height shrinks the
 * whole orbit to SHRINK of its size (0.62 at first, raised to 0.7 when the owner wanted the ring bigger), or less if
 * that is what it takes for the whole ring and its cards to fit on screen at the zoom (layout.shrink). The owner then
 * wanted the ring bigger still while the light travels, so its radius is RING_GROW times the one that would fit the
 * screen's height at the zoom - the camera follows the light round it anyway - and the final shrink makes up the
 * difference while the view glides back to the middle of the ring, and only then does the page move on and the navigation bar come back. The
 * intro takes INTRO_SCROLL of a screen's height past the pin and each step STEP_SCROLL - kept short: at 0.6, 0.7 and
 * 0.5 the orbit held the page still for about seven screens of scrolling, which read as the page crawling there and
 * then rushing everywhere else; scrolling back rewinds
 * everything, since the scenes and diagrams are pure functions of how far through their step the visitor is. Below the
 * desktop breakpoint there is nothing to pin, so the window sits on top, the steps follow as a grid of cards and pop
 * in when the beam lands, and a clock plays the steps on a loop. Under reduced motion nothing moves or plays: it is laid
 * out and finished, with the window holding the running app.
 *
 * There is no guide line sketching the path: a faint ring drawn while the steps flew out was turned down by the owner,
 * so the path is shown only by the planet's dark body and its rim as the light reaches it.
 *
 * Each scene is laid out at one fixed size and scaled into the window, so it keeps its proportions at any size.
 *
 * The ray's canvas reaches GLOW_BLEED past the orbit's box on every side, with the path shifted to match: sized to the
 * box itself, the glow round the bottom of the ring was sliced off in a hard line between the last two cards, most
 * visibly once the orbit had shrunk. The layout also keeps RING_ROOM clear above and below the ring's cards, so at
 * full size neither the glow nor the bottom cards run into the edge of the screen. The screen's height beats the ring's
 * 220px minimum radius: with the minimum winning, a short window got an orbit taller than itself, cut off at the bottom,
 * and a pin that let go before the shrink had finished.
 * Per-frame values - where each step, the window and the camera are, how much of the path and the ray are drawn, how
 * far through the step the visitor is (the --step CSS variable the diagrams and progress indicators read) - are
 * written straight to the DOM from one animation-frame loop; React re-renders only when the step changes, plus the
 * scene itself as its time moves. The zoom is CSS zoom rather than a transform, so text stays sharp while the camera
 * moves. The ray's canvas is rendered at RAY_DENSITY rather than at the full zoom: at the zoom it was over four million
 * pixels of shader a frame, most of them outside the view, and the glow is soft enough not to show the difference. Pinning relies on position: sticky, so no ancestor may clip with overflow: hidden (Landing's workbench section
 * clips horizontally only, for that reason). The pinned box clips horizontally only as well: while the view was left
 * on the top of the ring as it shrank, the bottom of the ring and its glow ran past the box and a clip on all sides
 * cut them off in a hard line across the sky below the orbit, so the outro also recentres the view on the whole ring.
 */
import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check, Code2, Eye, GraduationCap, ListChecks, MessageSquareText, RotateCw, Wand2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { POUR_LINE, designScale } from "./HorizonArc";
import { BuildScene } from "./BuildScenes";
import { useInView, usePrefersReducedMotion } from "./motion";
import { createOrbitRay, shapeLength, shapePath, shapePoint, type OrbitRay, type Shape } from "./orbitRay";

type Step = { label: string; title: string; detail: string; icon: LucideIcon; duration: number };

const STEPS: Step[] = [
  { label: "Describe", title: "Say what you want", detail: "Type the idea the way you'd say it to a friend.", icon: MessageSquareText, duration: 5000 },
  { label: "Interview", title: "Four quick questions", detail: "Tailored to your idea, then compiled into a brief.", icon: ListChecks, duration: 7600 },
  { label: "Build", title: "Every file, streamed", detail: "Each file lands in the project as it is written.", icon: Code2, duration: 7000 },
  { label: "Preview", title: "Live in its own pod", detail: "A real dev server, booted in its own sandbox.", icon: Eye, duration: 6200 },
  { label: "Change", title: "Ask for a change", detail: "Say what's next. It plans, edits and reports back.", icon: Wand2, duration: 6800 },
  { label: "Preview", title: "Updated in place", detail: "The running app reloads with the change in it.", icon: RotateCw, duration: 5200 },
  { label: "ExplainLLM", title: "Ask why it works", detail: "Select a line and ask. It reads, and never edits.", icon: GraduationCap, duration: 7600 },
];

const INTRO = 1800;
const STILL_STEP = 3;
const NODE_W = 256;
const NODE_H = 176;
const GAP = 14;
const MAX_RADIUS = 470;
const WINDOW_LIMIT = 1.15;
const RING_ROOM = 28;
const GLOW_BLEED = 140;
const STICKY_TOP = 12;
const ZOOM = 1.4;
const INTRO_SCROLL = 0.4;
const STEP_SCROLL = 0.42;
const OUTRO_SCROLL = 0.32;
const RAY_DENSITY = 1.1;
const SHRINK = 0.7;
const RING_GROW = 1.2;
const DESIGN = { w: 500, h: 340 };
const DESKTOP = "(min-width: 1024px)";
const CYCLE = STEPS.reduce((sum, step) => sum + step.duration, 0);
const REACH = Math.max(...STEPS.map((_, index) => Math.abs(Math.sin((index / STEPS.length) * Math.PI * 2))));

type Point = { x: number; y: number };
type Place = Point & { side: "left" | "right" };
type Layout = {
  w: number;
  h: number;
  shape: Shape;
  total: number;
  path: string;
  anchors: number[];
  nodes: Place[];
  window: Point;
  windowStart: Point;
  scale: number;
  zoom: number;
  shrink: number;
  nodeScale: number;
  pinned: number;
  lead: number;
  intro: number;
  span: number;
  outro: number;
};

function fitWindow(nodes: Point[], cx: number, cy: number, nodeW: number, nodeH: number, limit: number) {
  let best = 0.5;
  for (let h = 620; h >= 200; h -= 10) {
    let w = 900;
    for (const node of nodes) {
      if (Math.abs(node.y - cy) < h / 2 + nodeH / 2 + GAP) w = Math.min(w, 2 * (Math.abs(node.x - cx) - nodeW / 2 - GAP));
    }
    const clear = nodes.every((node) => Math.abs(node.x - cx) >= w / 2 + nodeW / 2 + GAP - 0.5 || Math.abs(node.y - cy) >= h / 2 + nodeH / 2 + GAP - 0.5);
    if (clear && w > 0) best = Math.max(best, Math.min(limit, w / DESIGN.w, h / DESIGN.h));
  }
  return best;
}

function timing(viewport: number, pinned: number) {
  const lead = Math.max(0, viewport * POUR_LINE - STICKY_TOP);
  return {
    pinned,
    lead,
    intro: Math.round(lead + INTRO_SCROLL * viewport),
    span: Math.round(STEPS.length * STEP_SCROLL * viewport),
    outro: Math.round(OUTRO_SCROLL * viewport),
  };
}

function circleNodes(cx: number, cy: number, r: number): Place[] {
  return STEPS.map((_, index) => {
    const angle = (index / STEPS.length) * Math.PI * 2;
    const x = cx + r * Math.sin(angle);
    return { x, y: cy - r * Math.cos(angle), side: x >= cx - 1 ? "right" : "left" };
  });
}

function clearOfWindow(ring: Place[], cx: number, cy: number, edge: number) {
  for (let scale = WINDOW_LIMIT; scale > 0.5; scale -= 0.01) {
    const reachX = (DESIGN.w * scale) / 2 + NODE_W / 2 + GAP;
    const reachY = (DESIGN.h * scale) / 2 + NODE_H / 2 + GAP;
    const nodes = ring.map((node) => {
      const dx = node.x - cx;
      if (Math.abs(node.y - cy) >= reachY || Math.abs(dx) >= reachX || Math.abs(dx) < 1) return node;
      return { ...node, x: cx + Math.sign(dx) * reachX };
    });
    const clear = nodes.every((node) => Math.abs(node.x - cx) <= edge && (Math.abs(node.y - cy) >= reachY || Math.abs(node.x - cx) >= reachX - 0.5));
    if (clear) return { nodes, scale };
  }
  return { nodes: ring, scale: fitWindow(ring, cx, cy, NODE_W, NODE_H, WINDOW_LIMIT) };
}

function withShape(shape: Shape) {
  return { shape, total: shapeLength(shape), path: shapePath(shape) };
}

function orbitLayout(w: number, viewport: number): Layout {
  const pinned = viewport - STICKY_TOP - 8;
  const r = Math.min(((pinned - NODE_H - 4 - 2 * RING_ROOM) / 2) * RING_GROW, Math.max(220, Math.min(MAX_RADIUS * RING_GROW, (w / 2 - NODE_W / 2 - 4) / REACH)));
  const h = Math.round(2 * r + NODE_H + 2 * RING_ROOM);
  const cx = w / 2;
  const cy = h / 2;
  const cleared = clearOfWindow(circleNodes(cx, cy, r), cx, cy, w / 2 - NODE_W / 2 - 4);
  const scale = cleared.scale * 0.82;
  return {
    w,
    h,
    ...withShape({ cx, cy, ex: 0, ey: 0, c: r }),
    anchors: STEPS.map((_, index) => index / STEPS.length),
    nodes: cleared.nodes,
    window: { x: cx, y: cy },
    windowStart: { x: cx, y: (DESIGN.h * scale) / 2 },
    scale,
    zoom: ZOOM,
    shrink: Math.min(SHRINK, (pinned - 8) / (h * ZOOM)),
    nodeScale: 1.15 / ZOOM,
    ...timing(viewport, pinned),
  };
}

function byClock(elapsed: number) {
  if (elapsed < 0) return { index: 0, fraction: 0 };
  let rest = elapsed % CYCLE;
  for (let index = 0; index < STEPS.length; index++) {
    if (rest < STEPS[index].duration) return { index, fraction: rest / STEPS[index].duration };
    rest -= STEPS[index].duration;
  }
  return { index: 0, fraction: 0 };
}

function byProgress(progress: number) {
  const at = Math.min(1, Math.max(0, progress)) * STEPS.length;
  const index = Math.min(STEPS.length - 1, Math.floor(at));
  return { index, fraction: at - index };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const ease = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);

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

function useDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && window.matchMedia(DESKTOP).matches);
  useEffect(() => {
    const query = window.matchMedia(DESKTOP);
    const update = () => setDesktop(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}

function SceneRunner({ index, ticker }: { index: number; ticker: Ticker }) {
  const t = useSyncExternalStore(ticker.subscribe, ticker.get);
  return <BuildScene index={index} t={t} />;
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
  if (index === 4) {
    return (
      <div className="flex h-[20px] items-center gap-1.5 text-[10px]">
        <span className="glyph-pop truncate rounded-md rounded-br-sm bg-white/[0.07] px-2 py-0.5 text-foreground/85" style={seg(0.2)}>
          Add a weekly chart
        </span>
        <Check className="glyph-pop h-3 w-3 shrink-0 text-[hsl(151_52.1%_56%)]" style={seg(3.2)} />
      </div>
    );
  }
  if (index === 5) {
    return (
      <div className="flex h-[20px] items-end gap-[3px]">
        {[0.4, 0.65, 0.15, 0.5, 0.8, 0.3, 1].map((height, k) => (
          <span key={k} className="glyph-bar flex-1 rounded-t-[2px] bg-primary/80" style={{ ...seg(k), "--h": height } as CSSProperties} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex h-[20px] items-center gap-1.5 text-[10px]">
      <span className="glyph-pop shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 text-primary" style={seg(0.3)}>
        Why a Set?
      </span>
      <span className="flex flex-1 flex-col gap-[3px]">
        <span className="glyph-track h-[2px]" style={seg(1)}>
          <span className="glyph-fill glyph-fill-3" />
        </span>
        <span className="glyph-track h-[2px] w-3/4" style={seg(2)}>
          <span className="glyph-fill glyph-fill-3" />
        </span>
      </span>
    </div>
  );
}

function Badge({ step, active, done }: { step: Step; active: boolean; done: boolean }) {
  const Icon = step.icon;
  return (
    <span
      className={cn(
        "orbit-badge relative grid shrink-0 place-items-center rounded-full border transition-colors duration-500",
        "h-7 w-7",
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

type NodeProps = {
  index: number;
  step: Step;
  active: boolean;
  done: boolean;
  place?: Place;
  animated: boolean;
  tucked?: string;
  nodeRef: (node: HTMLLIElement | null) => void;
};

function CardNode({ index, step, active, done, place, animated, tucked, nodeRef }: NodeProps) {
  return (
    <li
      ref={nodeRef}
      data-orbit-lead={index === 0 || undefined}
      data-active={active}
      data-done={done && !active}
      className={cn("orbit-node lg:absolute lg:h-[176px] lg:w-[256px]", !animated && "orbit-pop lg:[--cx:-50%] lg:[--cy:-50%]")}
      style={{ left: place?.x, top: place?.y, "--pop-delay": `${150 + index * 140}ms`, ...(animated ? { opacity: 0, transform: tucked } : {}) } as CSSProperties}
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

export function BuildOrbit() {
  const reduced = usePrefersReducedMotion();
  const desktop = useDesktop();
  const ids = useId().replace(/:/g, "");
  const [rootRef, visible] = useInView<HTMLDivElement>({ once: false, threshold: 0, rootMargin: "0px" });
  const [open, setOpen] = useState(false);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [step, setStep] = useState({ index: reduced ? STILL_STEP : 0, finished: reduced });
  const [ticker] = useState(createTicker);
  const [rayFailed, setRayFailed] = useState(false);
  const opened = useRef(0);
  const shown = useRef(step);
  const trailRef = useRef<SVGPathElement>(null);
  const rayCanvasRef = useRef<HTMLCanvasElement>(null);
  const rayRef = useRef<OrbitRay | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const shrinkRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<(HTMLLIElement | null)[]>([]);
  const placed = desktop && layout;
  const scrolled = Boolean(placed && !reduced);

  useEffect(() => {
    if (open) return;
    const check = () => {
      const node = rootRef.current;
      if (reduced || (node && node.getBoundingClientRect().top <= window.innerHeight * POUR_LINE)) {
        opened.current = performance.now();
        setOpen(true);
      }
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [open, reduced, rootRef]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !desktop) {
      setLayout(null);
      return;
    }
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
  }, [desktop, rootRef]);

  useEffect(() => {
    const canvas = rayCanvasRef.current;
    if (!canvas || !layout) return;
    const ray = createOrbitRay(canvas);
    if (!ray) {
      setRayFailed(true);
      return;
    }
    ray.resize(
      layout.w + 2 * GLOW_BLEED,
      layout.h + 2 * GLOW_BLEED,
      { ...layout.shape, cx: layout.shape.cx + GLOW_BLEED, cy: layout.shape.cy + GLOW_BLEED },
      RAY_DENSITY,
      layout.zoom,
      designScale(Math.min(window.innerWidth, 2100))
    );
    ray.draw(reduced ? 1 : 0, 0, reduced ? 1 : 0, 4);
    rayRef.current = ray;
    return () => {
      rayRef.current = null;
      ray.dispose();
    };
  }, [layout, reduced]);

  useEffect(() => {
    return () => {
      delete document.documentElement.dataset.orbitPinned;
    };
  }, []);

  useEffect(() => {
    if (reduced) {
      ticker.set(60000);
      setStep({ index: STILL_STEP, finished: true });
      return;
    }
    if (!visible || (!scrolled && !open)) return;
    const root = rootRef.current;
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

    const layOut = (geometry: Layout, intro: number, activeIndex: number) => {
      const sink = ease((intro - 0.25) / 0.7);
      const now = {
        x: geometry.windowStart.x + (geometry.window.x - geometry.windowStart.x) * sink,
        y: geometry.windowStart.y + (geometry.window.y - geometry.windowStart.y) * sink,
      };
      write(windowRef.current, "transform", `translate(-50%, -50%) translate(${(now.x - geometry.window.x).toFixed(1)}px, ${(now.y - geometry.window.y).toFixed(1)}px)`);
      geometry.nodes.forEach((node, index) => {
        const out = ease((intro - 0.08 - index * 0.075) / 0.4);
        const lift = index === activeIndex && intro >= 1 ? 1.06 : 1;
        const element = nodeRefs.current[index];
        write(element, "transform", `translate(-50%, -50%) translate(${((now.x - node.x) * (1 - out)).toFixed(1)}px, ${((now.y - node.y) * (1 - out)).toFixed(1)}px) scale(${((0.3 + 0.7 * out) * lift * geometry.nodeScale).toFixed(3)})`);
        write(element, "opacity", clamp01(out * 3).toFixed(3));
      });
      return now;
    };

    const tick = (time: number) => {
      let arc: number;
      let intro = 1;
      let position: { index: number; fraction: number };
      let top = 0;
      let outro = 0;
      if (scrolled && layout) {
        top = root?.getBoundingClientRect().top ?? 0;
        const since = window.innerHeight * POUR_LINE - top;
        intro = clamp01(since / layout.intro);
        const progress = clamp01((since - layout.intro) / layout.span);
        position = byProgress(progress);
        const from = layout.anchors[position.index];
        const to = position.index + 1 < STEPS.length ? layout.anchors[position.index + 1] : 1;
        arc = progress >= 1 ? 1 : from + (to - from) * position.fraction;
        outro = clamp01((since - layout.intro - layout.span) / layout.outro);
        write(shrinkRef.current, "transform", `scale(${(1 - (1 - layout.shrink) * ease(outro)).toFixed(4)})`);
        const flag = since >= 0 && since < layout.intro + layout.span + layout.outro + 40 ? "true" : "false";
        if (document.documentElement.dataset.orbitPinned !== flag) document.documentElement.dataset.orbitPinned = flag;
      } else {
        position = byClock(time - opened.current - INTRO);
        arc = (position.index + position.fraction) / STEPS.length;
      }
      const finished = scrolled ? arc >= 1 : false;
      if (position.index !== shown.current.index || finished !== shown.current.finished) {
        shown.current = { index: position.index, finished };
        setStep(shown.current);
      }
      ticker.set(Math.round((position.fraction * STEPS[position.index].duration) / 40) * 40);
      if (root) write(root, "--step", position.fraction.toFixed(3));

      if (layout) {
        const head = shapePoint(layout.shape, arc);
        const windowNow = scrolled ? layOut(layout, intro, position.index) : layout.window;
        const travelling = scrolled ? intro >= 1 && arc < 1 : time - opened.current > INTRO * 0.6;
        const body = scrolled ? ease(intro / 0.6) : clamp01((time - opened.current) / INTRO);
        rayRef.current?.draw(arc, travelling ? 1 : 0, body, time / 1000);
        write(trailRef.current, "stroke-dasharray", `${(arc * layout.total).toFixed(1)} ${layout.total.toFixed(1)}`);
        {
          const follow = intro >= 1 ? 0.55 : 0;
          const focus = { x: windowNow.x + (head.x - windowNow.x) * follow, y: windowNow.y + (head.y - windowNow.y) * follow };
          const viewW = root?.clientWidth ?? layout.w;
          const z = layout.zoom;
          const active = layout.nodes[position.index];
          const halfW = (NODE_W * layout.nodeScale * z) / 2 + 20;
          const halfH = (NODE_H * layout.nodeScale * z) / 2 + 20;
          const keep = (value: number, center: number, half: number, size: number) => clamp(value, half - center * z, size - half - center * z);
          const settle = ease(outro);
          const following = {
            x: clamp(keep(viewW / 2 - focus.x * z, active.x, halfW, viewW), viewW - layout.w * z, 0),
            y: clamp(keep(layout.pinned / 2 - focus.y * z, active.y, halfH, layout.pinned), layout.pinned - layout.h * z, 0),
          };
          const target = {
            x: following.x + ((viewW - layout.w * z) / 2 - following.x) * settle,
            y: following.y + ((layout.pinned - layout.h * z) / 2 - following.y) * settle,
          };
          if (!camera.ready) Object.assign(camera, target, { ready: true });
          camera.x += (target.x - camera.x) * 0.12;
          camera.y += (target.y - camera.y) * 0.12;
          write(cameraRef.current, "transform", `translate(${camera.x.toFixed(1)}px, ${camera.y.toFixed(1)}px)`);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [open, visible, reduced, layout, scrolled, ticker, rootRef]);

  const current = STEPS[step.index];
  const screen = placed ? { width: DESIGN.w * layout.scale, height: DESIGN.h * layout.scale } : undefined;
  const tucked = (point: Point) =>
    layout ? `translate(-50%, -50%) translate(${(layout.windowStart.x - point.x).toFixed(1)}px, ${(layout.windowStart.y - point.y).toFixed(1)}px) scale(0.3)` : undefined;
  const pinnedHeight = scrolled && layout ? layout.pinned + layout.intro - layout.lead + layout.span + layout.outro : undefined;

  return (
    <div ref={rootRef} data-open={open} className="build-orbit relative" style={pinnedHeight ? { height: pinnedHeight } : undefined}>
      <div
        className={cn(scrolled && "sticky", placed && "overflow-x-clip")}
        style={scrolled && layout ? { top: STICKY_TOP, height: layout.pinned } : undefined}
      >
        <div ref={shrinkRef} className={cn(scrolled && "h-full origin-center")}>
          <div ref={cameraRef} className={cn(placed && "origin-top-left will-change-transform")}>
            <div
              className="relative flex flex-col lg:block lg:min-h-[560px]"
              style={placed ? ({ height: layout.h, width: layout.w, zoom: layout.zoom } as CSSProperties) : undefined}
            >
              {placed && rayFailed && (
                <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox={`0 0 ${layout.w} ${layout.h}`}>
                  <defs>
                    <mask id={`${ids}-trail`} maskUnits="userSpaceOnUse" x={-40} y={-40} width={layout.w + 80} height={layout.h + 80}>
                      <path ref={trailRef} d={layout.path} fill="none" stroke="white" strokeWidth={44} style={{ strokeDasharray: reduced ? undefined : `0 ${layout.total}` }} />
                    </mask>
                  </defs>
                  <g mask={`url(#${ids}-trail)`}>
                    <path d={layout.path} className="orbit-ray orbit-ray-glow" />
                    <path d={layout.path} className="orbit-ray orbit-ray-body" />
                    <path d={layout.path} className="orbit-ray orbit-ray-core" />
                  </g>
                </svg>
              )}
              {placed && !rayFailed && (
                <canvas
                  ref={rayCanvasRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute"
                  style={{ left: -GLOW_BLEED, top: -GLOW_BLEED, width: `calc(100% + ${2 * GLOW_BLEED}px)`, height: `calc(100% + ${2 * GLOW_BLEED}px)` }}
                />
              )}

              <ol className="mt-4 grid grid-cols-2 gap-3 lg:contents">
                {STEPS.map((item, index) => {
                  return (
                    <CardNode
                      key={index}
                      index={index}
                      step={item}
                      active={index === step.index && !step.finished}
                      done={step.finished || index < step.index}
                      place={placed ? layout.nodes[index] : undefined}
                      animated={scrolled}
                      tucked={scrolled && layout ? tucked(layout.nodes[index]) : undefined}
                      nodeRef={(node) => {
                        nodeRefs.current[index] = node;
                      }}
                    />
                  );
                })}
              </ol>

              <div
                ref={windowRef}
                data-orbit-window
                className={cn(
                  "relative z-10 order-first mx-auto flex h-[400px] w-full max-w-[600px] flex-col overflow-hidden rounded-xl font-mono border border-border/80 bg-card/95 shadow-[0_40px_90px_-30px_rgb(0_0_0/0.85),0_0_0_1px_hsl(var(--primary)/0.06)] lg:absolute lg:max-w-none",
                  !scrolled && "lg:-translate-x-1/2 lg:-translate-y-1/2"
                )}
                style={
                  placed
                    ? {
                        ...screen,
                        left: layout.window.x,
                        top: layout.window.y,
                        ...(scrolled
                          ? { transform: `translate(-50%, -50%) translate(${layout.windowStart.x - layout.window.x}px, ${layout.windowStart.y - layout.window.y}px)` }
                          : {}),
                      }
                    : undefined
                }
              >
                <div
                  className="flex h-full w-full flex-col lg:absolute lg:left-0 lg:top-0 lg:origin-top-left"
                  style={placed ? { width: DESIGN.w, height: DESIGN.h, transform: `scale(${layout.scale})` } : undefined}
                >
                  <div className="flex items-center gap-3 border-b border-border/70 bg-panel/80 px-3.5 py-2.5">
                    <div className="terminal-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground">running-club — Singularity</span>
                    <span key={step.index} className="ml-auto shrink-0 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] text-primary animate-in fade-in zoom-in-95 duration-300">
                      0{step.index + 1} · {current.label}
                    </span>
                  </div>
                  <span className="relative block h-[2px] bg-border/50">
                    <span className="orbit-bar absolute inset-0 origin-left bg-primary" />
                  </span>
                  <div key={step.index} className="min-h-0 flex-1 animate-in fade-in duration-300">
                    <SceneRunner index={step.index} ticker={ticker} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
