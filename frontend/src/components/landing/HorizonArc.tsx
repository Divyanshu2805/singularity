/**
 * The planet rim over "How it works": a huge dark circle whose lower edge lights up as the visitor scrolls, then pours
 * a beam of light straight down onto the build orbit's window - the moment the orbit opens and its ray sets off.
 *
 * Handles: compiling the shader, measuring where the rim and the target sit, sizing the canvas to reach a little past
 * the target, turning the scroll position into the three stages of the transition, and drawing them: the rim and the
 * atmosphere under it lighting from both sides inwards; a white-hot flare blooming where the light meets at the rim's
 * lowest point; then the atmosphere being drawn down at the centre into a funnel - the vortex - that narrows into a
 * beam, which falls to the target's top edge. It also exports POUR_LINE, the viewport line the whole page times the
 * landing to.
 *
 * It replaced the hero's old pour - the black hole's light running down the glass card's sides, round a bowl under it
 * and down onto the orbit - at the owner's request, modelled on a reference where a planet's lit rim pours light onto
 * a chip below it. The colours are that reference's own (ramp(), in glsl.ts, which the build orbit's ray shares): deep
 * ember far from the rim, vivid gold in the atmosphere, a pale gold edge and a white core where the light is
 * hottest. Every layer is a smooth falloff, as in the reference. The vortex is the reference's own shape, not a
 * texture, copied from its frames: a band of atmosphere about 200 design pixels deep under the whole rim, with a soft
 * but definite lower edge (a gaussian in its depth), so the band follows the curve and dark sky shows below it; next
 * to the beam the band is drawn further down as the light pours; and the white is confined to a funnel - a wide flare
 * under the rim's lowest point that pinches within a few dozen pixels into a column about 45 wide - so the atmosphere
 * right beside the column stays ember, with a warm haze just above the lowest point. Three earlier tries were turned
 * down: noise streaks flowing through the atmosphere ("pathetic"), a thin white line in a wash of pink haze ("just a
 * line"), and a tornado column with helical bands - the broad haze in them left no dark sky and no gold beside the
 * column, which is what makes the reference read as a shape. The beam used to end in a bloom - a white-and-pink
 * splash spreading across the target's top edge as it landed - which the owner turned down as a "blast"; the whole
 * beam was briefly removed with it, then asked back in the same funnel form, so now the column simply ends at the
 * target.
 *
 * Everything is a pure function of the scroll position, so scrolling back up rewinds it exactly. The rim starts to
 * light when its lowest point comes onto the screen (RIM_START of the viewport's height - by then its raised ends are
 * about mid-screen) and the light travels from the ends to the centre at the pace of the scroll itself, evenly, over
 * all the scroll up to the moment the beam starts to fall, which on a tall screen is close to half a screen of
 * scrolling; the two fronts meet at the lowest point exactly then (FRONTS), and the flare blooms there as the funnel
 * begins to draw down. The owner asked for exactly this - "start on half a scroll and take time to form with the
 * scroll" - after a run of versions that each got one half of it wrong. The first waited for the lowest point to reach
 * the bottom of the screen, as now, but then lit the whole rim within two turns of the wheel ("instant"): its front
 * was so soft (280 design pixels either way) and ran so far past the centre that the rim was lit almost at once, and
 * the last quarter of the scroll only grew the flare. Starting earlier - while the lowest point was still below the
 * screen, RIM_LEAD of the way through the scroll that brings the ends into view - bought scroll, and so did moving
 * the orbit further below the heading (32rem), but the owner then wanted that gap reduced (22rem again, Landing's
 * workbench section), and a start pushed earlier still to make up for it (RIM_LEAD 0.95) had most of the arc formed
 * before it was properly on screen: "why is the arc forming so early?". So the scroll it needs is found at the other
 * end instead: the beam's fall takes no more than POUR_SCROLL.max of scroll however long the drop (150, down from
 * 220), the fronts use the whole stretch up to the fall rather than 0.86 of a stretch ending 30px short of it, and
 * the front stays narrow. The beam then falls
 * over the scroll that follows and lands at exactly the position where the target's top crosses POUR_LINE of the
 * viewport's height - the same line BuildOrbit opens at, so the window lights as the beam reaches it. Once the beam has
 * landed the orbit pins its window near the top of the screen while the page scrolls on, so the beam's foot is the
 * window's live top edge, read every frame (BuildOrbit marks the window data-orbit-window): the ray stays attached to
 * the box as the gap opens instead of stopping where the box used to be. Its foot follows the box sideways too
 * (uFootX): the pinned orbit's camera pans and zooms after the travelling light, carrying the box or card left or
 * right, and a column fixed at the screen's centre was left standing beside it; the column now bends smoothly from
 * the rim's lowest point to the box's centre. When the orbit's first step card
 * (data-orbit-lead) flies out of the window up to the top of the ring, the beam stops at that card instead, once it is
 * more than LEAD_SHOWN visible - the foot is whichever of the two is higher - so the beam never runs on through the
 * card to the window below it, and the canvas reaches FOLLOW_ROOM of a screen past the target to carry it. It fades
 * out between FADE_FROM and FADE_TO of a screen past the landing - just after the orbit's ray has set off round the
 * ring from the top, where this beam lands, so the light is seen pouring on into it (orbitRay.ts draws that ray as
 * the rim of a second planet with this shader's own recipe, sized by designScale, so the two read as one light; it
 * used to fade out just before, and the ray then read as a different light). The column narrows towards its foot. The circle's radius is FLATTEN times the canvas's width (never under
 * MIN_RADIUS), so on a wide screen the rim runs off both sides like the reference's planet, and the rim's lowest point
 * sits RIM_GAP below the heading. It started at the reference's own 0.82 of the width (0.85, at least 1000px); the
 * owner then asked for a smaller planet with a deeper curve, so the sides now rise about half as high again above the
 * lowest point as they did, and on the widest screens the rim's ends run out through the canvas's faded top edge. The shader's sizes - the
 * atmosphere's depth, the flare, the funnel, the beam's width - are in design pixels, shrunk with the screen below
 * DESIGN_WIDTH (to MIN_SCALE at most), since at full size on a phone the flare, funnel and foot all ran together into
 * one white blot over the short drop. The geometry is measured from the layout and remeasured when the window, the
 * heading, the target or the page's height changes; each frame only reads the scroll position.
 *
 * The loop runs only while the canvas is on screen and the tab is visible. Under reduced motion one finished frame is
 * drawn and left; without WebGL a plain CSS glow stands in for the rim.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FULLSCREEN_VERTEX, RAMP_GLSL, createProgram } from "./glsl";
import { usePrefersReducedMotion } from "./motion";

export const POUR_LINE = 0.62;

export function designScale(width: number) {
  return Math.min(1, Math.max(MIN_SCALE, width / DESIGN_WIDTH));
}

const RIM_GAP = 120;
const MIN_RADIUS = 800;
const FLATTEN = 0.65;
const RIM_START = 1;
const RIM_MIN = 220;
const FRONTS = 0.86;
const POUR_SCROLL = { min: 120, max: 150 };
const TAIL = 180;
const FOLLOW_ROOM = 0.9;
const FADE_FROM = 1.05;
const FADE_TO = 1.35;
const LEAD_SHOWN = 0.4;
const DESIGN_WIDTH = 1280;
const MIN_SCALE = 0.45;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform vec4 uArc;
uniform vec2 uBeam;
uniform vec3 uProgress;
uniform float uFade;
uniform float uFootX;
${RAMP_GLSL}

void main() {
  float px = uArc.w;
  vec2 fc = gl_FragCoord.xy;
  float rim = uProgress.x, pour = uProgress.y, landed = uProgress.z;

  float x = (fc.x - uArc.x) / px;
  float ax = abs(x);
  float d = (length(fc - uArc.xy) - uArc.z) / px;
  float halfW = uResolution.x / px * 0.5;
  float below = (uBeam.x - fc.y) / px;
  float drop = (uBeam.x - uBeam.y) / px;
  float front = pour * drop;
  float breath = 1.0 + 0.04 * sin(uTime * 0.8);

  float gain = smoothstep(0.0, 0.2, rim);
  float edgeX = (1.0 - min(rim / 0.86, 1.0)) * (halfW + 200.0) - 200.0;
  float lit = smoothstep(edgeX - 180.0, edgeX + 180.0, ax) * gain;
  float pull = smoothstep(0.0, 1.0, pour);

  float light = (exp(-pow(d / 1.6, 2.0)) * 2.4 + exp(-pow(d / 6.0, 2.0)) * 0.7) * lit;
  if (d < 0.0) {
    light += exp(d / 14.0) * 0.16 * lit;
  } else {
    float depth = 200.0 + pull * min(drop * 0.55, 170.0) * exp(-pow(x / 150.0, 2.0));
    light += (exp(-pow(d / depth, 2.2)) * 0.6 + exp(-d / 22.0) * 0.4) * lit * breath;
  }

  float meet = smoothstep(0.84, 1.0, rim);
  light += meet * exp(-pow(x / 175.0, 2.0) - pow(below / 30.0, 2.0)) * 1.6;
  if (below < 0.0) light += meet * exp(-pow(x / 200.0, 2.0) - pow(below / 55.0, 2.0)) * 0.5;

  if (pour > 0.0 && below > -30.0) {
    float y = max(below, 0.0);
    float along = clamp(y / max(drop, 1.0), 0.0, 1.0);
    float bx = x - uFootX * along * along * (3.0 - 2.0 * along);
    float hw = 12.0 + 14.0 * (1.0 - along) + 150.0 * exp(-y / 28.0);
    float funnel = exp(-pow(bx / hw, 4.0)) * mix(1.7, 1.3, along) + exp(-pow(bx / (hw * 2.2), 2.0)) * 0.3;
    light += funnel * smoothstep(front + 10.0, front - 30.0, below) * smoothstep(-30.0, 6.0, below) * (1.0 - uFade);
    float hx = (fc.x - uArc.x) / px - uFootX * clamp(front / max(drop, 1.0), 0.0, 1.0);
    float head = exp(-pow(hx / 22.0, 2.0) - pow((below - front) / 20.0, 2.0)) * 2.0 + exp(-pow(hx / 80.0, 2.0) - pow((below - front) / 70.0, 2.0)) * 0.6;
    light += head * smoothstep(0.0, 0.06, pour) * (1.0 - landed);
  }

  float fade = smoothstep(0.0, 70.0 * px, uResolution.y - fc.y) * smoothstep(0.0, 70.0 * px, fc.y);
  float c = 1.0 - exp(-light * fade);
  float alpha = clamp(c * 1.15, 0.0, 1.0);
  gl_FragColor = vec4(ramp(c) * alpha, alpha);
}
`;

type Layout = { rimY: number; targetY: number; pageTop: number; width: number; height: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (value: number) => (value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2);

export function HorizonArc({
  heading,
  target,
  className,
}: {
  heading: RefObject<HTMLElement>;
  target: RefObject<HTMLElement>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    if (!canvas || !gl) {
      setFallback(true);
      return;
    }
    const built = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!built) {
      setFallback(true);
      return;
    }
    const { program, dispose } = built;
    const uResolution = gl.getUniformLocation(program, "uResolution");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uArc = gl.getUniformLocation(program, "uArc");
    const uBeam = gl.getUniformLocation(program, "uBeam");
    const uProgress = gl.getUniformLocation(program, "uProgress");
    const uFade = gl.getUniformLocation(program, "uFade");
    const uFootX = gl.getUniformLocation(program, "uFootX");

    const ratio = Math.min(window.devicePixelRatio || 1, 1);
    let layout: Layout | null = null;
    let box: HTMLElement | null = null;
    let lead: HTMLElement | null = null;
    let frame = 0;
    let running = false;
    let onScreen = false;
    const started = performance.now();

    const measure = (): Layout | null => {
      const top = heading.current?.getBoundingClientRect();
      const goal = target.current?.getBoundingClientRect();
      if (!top || !goal) return null;
      const rect = canvas.getBoundingClientRect();
      const targetY = goal.top - rect.top;
      return {
        rimY: top.bottom - rect.top + RIM_GAP,
        targetY,
        pageTop: rect.top + window.scrollY,
        width: canvas.clientWidth,
        height: Math.round(targetY + TAIL + window.innerHeight * FOLLOW_ROOM),
      };
    };

    const resize = () => {
      box = target.current?.querySelector<HTMLElement>("[data-orbit-window]") ?? target.current;
      lead = target.current?.querySelector<HTMLElement>("[data-orbit-lead]") ?? null;
      layout = measure();
      if (!layout) return;
      canvas.style.height = `${layout.height}px`;
      const pixelWidth = Math.max(1, Math.round(layout.width * ratio));
      const pixelHeight = Math.max(1, Math.round(layout.height * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      const radius = Math.max(layout.width * FLATTEN, MIN_RADIUS);
      const scale = designScale(layout.width);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform4f(uArc, (layout.width / 2) * ratio, canvas.height - (layout.rimY - radius) * ratio, radius * ratio, ratio * scale);
      gl.uniform2f(uBeam, canvas.height - layout.rimY * ratio, canvas.height - layout.targetY * ratio);
    };

    const progress = () => {
      if (!layout) return;
      const viewport = window.innerHeight;
      const scroll = window.scrollY;
      const canvasTop = layout.pageTop - scroll;
      const boxRect = box?.getBoundingClientRect();
      const leadRect = lead && Number(lead.style.opacity || 0) > LEAD_SHOWN ? lead.getBoundingClientRect() : null;
      let foot = boxRect ? boxRect.top - canvasTop : layout.targetY;
      let footRect = boxRect;
      if (leadRect && leadRect.top - canvasTop < foot) {
        foot = leadRect.top - canvasTop;
        footRect = leadRect;
      }
      const canvasLeft = canvas.getBoundingClientRect().left;
      const footX = footRect ? footRect.left + footRect.width / 2 - canvasLeft - layout.width / 2 : 0;
      gl.uniform1f(uFootX, footX / designScale(layout.width));
      gl.uniform2f(uBeam, canvas.height - layout.rimY * ratio, canvas.height - foot * ratio);
      if (reduced) {
        gl.uniform3f(uProgress, 1, 1, 1);
        gl.uniform1f(uFade, 0);
        return;
      }
      const lands = layout.pageTop + layout.targetY - viewport * POUR_LINE;
      const pourFrom = lands - Math.min(POUR_SCROLL.max, Math.max(POUR_SCROLL.min, (layout.targetY - layout.rimY) * 0.9));
      const rimFrom = Math.min(layout.pageTop + layout.rimY - viewport * RIM_START, pourFrom - RIM_MIN);
      const rim = clamp01(((scroll - rimFrom) / (pourFrom - rimFrom)) * FRONTS);
      const fallen = clamp01((scroll - pourFrom) / (lands - pourFrom));
      const landed = clamp01((fallen - 0.9) / 0.1);
      const pour = easeInOut(fallen);
      gl.uniform3f(uProgress, rim, pour, landed);
      gl.uniform1f(uFade, clamp01((scroll - lands - viewport * FADE_FROM) / (viewport * (FADE_TO - FADE_FROM))));
    };

    const render = (time: number) => {
      progress();
      gl.uniform1f(uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = () => {
      render((performance.now() - started) / 1000);
      frame = window.requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced || document.hidden || !onScreen) return;
      running = true;
      frame = window.requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(frame);
    };

    resize();
    render(4);

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      render(running ? (performance.now() - started) / 1000 : 4);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    const layoutObserver = new ResizeObserver(onResize);
    [heading.current, target.current, document.body].forEach((node) => node && layoutObserver.observe(node));
    return () => {
      stop();
      observer.disconnect();
      layoutObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      dispose();
    };
  }, [reduced, heading, target]);

  if (fallback) {
    return (
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute inset-x-0 top-0 h-[60rem]", className)}
        style={{ backgroundImage: "radial-gradient(120% 40% at 50% 0%, transparent 62%, hsl(39.1 96% 62% / 0.26) 64%, transparent 72%)" }}
      />
    );
  }

  return <canvas ref={canvasRef} aria-hidden="true" className={cn("pointer-events-none absolute left-1/2 top-0 w-screen max-w-[2100px] -translate-x-1/2", className)} />;
}
