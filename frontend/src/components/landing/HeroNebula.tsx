/**
 * The hero's sky: an emission nebula filling the whole background behind the headline and the glass card, which
 * replaced the gold black hole on 2026-10-03 when the owner asked for "a nebula effect in here instead of a black
 * hole in the whole bg", smooth and looking real. A luminous heart of gas sits just above the card's top edge, where
 * the hole was, and the cloud spreads from it across the full width, rising at both sides to frame the headline; the
 * card stands in front of it, so its lower part glows through the glass.
 *
 * Handles: compiling the gas shader, sizing both canvases to the hero and placing the nebula's heart from the card's
 * position, scattering and drawing the stars, the scroll parallax, the intro's spreading light, the frame loop and
 * its throttling, and the plain gradient that stands in where WebGL is not to be had.
 *
 * The gas is built the way a photograph of one looks rather than as soft blobs of light. Two levels of domain warp
 * fold a five-octave noise into billows; it is raised to an exponential (exp(3.4 * (cloud - 0.58))), which gives
 * the bright clumps and dark gaps of real gas a high range instead of an even fog, and two finer noises break it up
 * further at about forty and fifteen pixels. An envelope decides where the gas is - a broad band through the heart,
 * tilted a little, and two wings rising at the sides, over a thin floor everywhere - and clears it behind the
 * headline. Light falls off from the heart (one unit being a third of the screen's width), so the gas is brightest
 * there and dim at the edges. A ridged noise lays faint filaments through the mid-bright gas; a third warped noise
 * cuts dark lanes of dust through it, edged with a little light where they border the glow, and the lanes also hide
 * the stars behind them. Colour follows heat - dusty rust in the thin outskirts, amber in the body, gold and then a
 * pale cream in the heart - and the faintest gas high up leans towards a cool slate, the hero's one cool tone, kept
 * dim. Light is summed as intensity and tone-mapped (1 - exp(-x)), so the heart rolls off to cream instead of
 * clipping, and the output is dithered, since gradients this dark band visibly on an 8-bit screen.
 *
 * A first version drew the dust as ridges of cliffs with lit crests (after JWST's Cosmic Cliffs); thin bright crest
 * lines and rising steam read as glowing mountains and fire, so it was replaced by this one before the owner saw it.
 * Saturated yellow in the heart read as flame as well, which is why the highlights go to cream.
 *
 * Motion is slow on purpose: the warps drift at a few thousandths of a unit a second (faster offsets made the
 * dashboard's nebula boil) and the light breathes a few percent. Scrolling moves the gas and the dust at different
 * rates, and the stars slower than either, so the hero has depth as it leaves the screen.
 *
 * On a load with the landing intro (intro.ts) the light spreads outwards from the heart (INTRO.light, after the black
 * hole's horizon line opening from the centre, which the owner liked), the stars coming up with it, and the
 * filaments rise after it (INTRO.steam); at their finished values both reduce exactly to the resting frame.
 *
 * The gas is soft, so it renders at half the screen's resolution (one device pixel per CSS pixel at most) and is
 * stretched - about 3.4 ms for the whole canvas at a 1588 pixel wide window - and the canvas reaches past the hero's
 * foot, so each frame is scissored to the part of it on screen. At rest it redraws about 30 times a second, which is
 * plenty for motion this slow; while the page scrolls or the intro plays it redraws every frame. The stars are sharp,
 * so they have a canvas of their own under the gas at up to one and a half device pixels per CSS pixel - thick gas
 * and dust hide the ones behind them, as they should - redrawn about 15 times a second for the twinkle. Seven bright
 * ones carry a halo and four thin diffraction spikes; halos and spikes are pre-rendered sprites, so a frame allocates
 * nothing. Both loops run only while the hero is on screen and the tab is visible; under reduced motion one finished
 * frame is drawn and holds still, without parallax.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FULLSCREEN_VERTEX, createProgram } from "./glsl";
import { INTRO, useIntro } from "./intro";
import { usePrefersReducedMotion } from "./motion";

const GAS_SCALE = 0.5;
const GAS_FRAME_MS = 33;
const STAR_FRAME_MS = 66;
const STAR_RATIO = 1.5;
const HEART_ABOVE_CARD = 70;
const STILL_TIME = 40;
const STAR_PARALLAX = 0.45;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uPx;
uniform float uBase;
uniform float uUnit;
uniform float uTime;
uniform float uScroll;
uniform vec2 uIntro;

const mat2 ROT = mat2(0.8, 0.6, -0.6, 0.8);
const float EXPOSURE = 1.4;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm3(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = ROT * p * 2.03; a *= 0.5; }
  return v / 0.875;
}

float fbm4(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = ROT * p * 2.03; a *= 0.5; }
  return v / 0.9375;
}

float fbm5(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = ROT * p * 2.03; a *= 0.5; }
  return v / 0.96875;
}

float bump(float x, float at, float width) {
  float d = (x - at) / width;
  return exp(-d * d);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
  float height = uRes.y / uPx;
  vec2 p = vec2((css.x - 0.5 * uRes.x / uPx) / uUnit, (uBase - css.y) / uUnit);
  float t = uTime;
  float lift = uScroll / uUnit;
  float light = uIntro.x, rising = uIntro.y;

  vec2 pg = p + vec2(0.0, lift * 0.32);
  vec2 pd = p + vec2(0.0, lift * 0.2);

  vec2 drift = vec2(t * 0.0035, -t * 0.0012);
  vec2 q = vec2(fbm4(pg * 0.75 + drift), fbm4(pg * 0.75 + vec2(5.2, 1.3) - drift));
  vec2 r = vec2(fbm4(pg * 1.25 + 2.2 * q + vec2(1.7, 9.2) + t * 0.002), fbm4(pg * 1.25 + 2.2 * q + vec2(8.3, 2.8) - t * 0.0025));
  float cloud = fbm5(pg * 1.5 + 2.4 * r);
  float fine = fbm3(pg * 6.5 + 1.4 * r + 3.1);
  float micro = fbm3(pg * 15.0 + 2.2 * r + 8.6);

  float band = bump(pg.y, 0.04 - 0.1 * pg.x, 0.42);
  float wings = 0.75 * bump(abs(pg.x), 1.22, 0.42) * smoothstep(-0.5, 0.5, pg.y) * exp(-max(pg.y - 0.85, 0.0) / 0.3);
  float env = 0.1 + max(band, wings);
  env *= 1.0 - 0.72 * bump(pg.x, 0.0, 0.75) * smoothstep(0.22, 0.7, pg.y);

  float dens = env * exp(3.4 * (cloud - 0.58)) * (0.7 + 0.6 * fine) * (0.78 + 0.44 * micro);
  vec2 c = pg * vec2(0.5, 1.0);
  float near = 1.0 / (1.0 + dot(c, c) / 0.07);
  float illum = 0.3 + near + 0.3 * (1.0 - q.y);
  float spread = smoothstep(light * 2.6, light * 2.6 - 1.1, length(c * vec2(1.0, 1.6))) * smoothstep(0.0, 0.2, light);

  float fil = pow(1.0 - abs(2.0 * fbm4(pg * 2.3 + 2.8 * r + 7.0) - 1.0), 7.0);
  float emission = dens * illum + fil * env * illum * 0.32 * rising * smoothstep(0.3, 0.6, cloud);

  float dn = fbm4(pd * 1.35 + 1.7 * q + vec2(3.1, 7.7));
  float lane = smoothstep(0.48, 0.66, dn) * (0.4 + 0.6 * max(band, wings));
  float edge = smoothstep(0.4, 0.52, dn) * (1.0 - smoothstep(0.52, 0.64, dn));
  emission *= 1.0 - 0.9 * lane;
  emission += edge * illum * env * 0.22 * (0.6 + 0.8 * fine);
  emission += 0.2 * exp(-dot(c, c) / 0.02) * (0.7 + 0.6 * cloud);

  float temp = clamp(0.55 * near + 0.5 * (cloud - 0.45) + 0.25 * edge, 0.0, 1.0);
  vec3 hue = mix(vec3(0.34, 0.13, 0.08), vec3(0.78, 0.38, 0.14), smoothstep(0.0, 0.3, temp));
  hue = mix(hue, vec3(1.0, 0.7, 0.38), smoothstep(0.25, 0.6, temp));
  hue = mix(hue, vec3(1.0, 0.93, 0.82), smoothstep(0.55, 0.95, temp));
  hue = mix(hue, vec3(0.4, 0.5, 0.6), 0.32 * (1.0 - smoothstep(0.0, 0.35, temp)) * smoothstep(0.2, 0.9, pg.y));

  vec3 col = hue * emission * EXPOSURE * spread * (1.0 + 0.04 * sin(t * 0.4));
  col = 1.0 - exp(-col);
  float dustA = lane * min(env, 1.0) * 0.85 * smoothstep(0.0, 0.2, light);
  col = col * (1.0 - dustA * 0.6);
  float fade = smoothstep(height, height * 0.6, css.y) * smoothstep(0.0, 120.0, css.y);
  col *= fade;
  float alpha = clamp(max(max(col.r, max(col.g, col.b)), dustA * fade), 0.0, 1.0);
  col += (hash(gl_FragCoord.xy + fract(t * 7.0)) - 0.5) / 255.0 * step(0.002, alpha);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), alpha);
}
`;

type Geometry = { width: number; height: number; base: number; unit: number; pageTop: number };

interface Star {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  tint: string;
  phase: number;
  pace: number;
  spikes: number;
}

const STAR_TINTS = ["255, 247, 236", "255, 232, 196", "214, 228, 255", "255, 214, 168"];

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function scatterStars({ width, base }: Geometry): Star[] {
  const random = seeded(20261003);
  const stars: Star[] = [];
  const count = Math.round(Math.min(150, (width * base) / 6500));
  while (stars.length < count) {
    const x = random() * width;
    const y = random() * (base + 160);
    const behindHeadline = Math.abs(x - width / 2) < Math.min(420, width * 0.32) && y < base - 90;
    if (behindHeadline && random() < 0.8) continue;
    const level = Math.pow(random(), 2.2);
    stars.push({
      x,
      y,
      radius: 0.45 + 0.9 * level,
      alpha: 0.25 + 0.6 * level,
      tint: STAR_TINTS[random() < 0.75 ? Math.floor(random() * 2) : 2 + Math.floor(random() * 2)],
      phase: random() * Math.PI * 2,
      pace: 0.0004 + random() * 0.0009,
      spikes: 0,
    });
  }
  const bright = [
    [0.09, 0.2, 1.0],
    [0.9, 0.14, 0.85],
    [0.27, 0.62, 0.7],
    [0.76, 0.56, 0.9],
    [0.04, 0.66, 0.6],
    [0.96, 0.44, 0.65],
    [0.63, 0.84, 0.55],
  ];
  for (const [fx, fy, size] of bright) {
    stars.push({
      x: fx * width,
      y: fy * base,
      radius: 1.1 + 0.6 * size,
      alpha: 0.85,
      tint: STAR_TINTS[fx > 0.5 && fy < 0.5 ? 2 : 0],
      phase: random() * Math.PI * 2,
      pace: 0.0003 + random() * 0.0004,
      spikes: 26 + 30 * size,
    });
  }
  return stars;
}

function sprite(size: number, paint: (context: CanvasRenderingContext2D, half: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) paint(context, size / 2);
  return canvas;
}

function haloSprite() {
  return sprite(64, (context, half) => {
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, "rgba(255, 248, 232, 1)");
    gradient.addColorStop(0.22, "rgba(255, 232, 196, 0.38)");
    gradient.addColorStop(1, "rgba(255, 214, 160, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, half * 2, half * 2);
  });
}

function spikeSprite() {
  return sprite(256, (context, half) => {
    const arm = (horizontal: boolean) => {
      const gradient = horizontal
        ? context.createLinearGradient(0, half, half * 2, half)
        : context.createLinearGradient(half, 0, half, half * 2);
      gradient.addColorStop(0, "rgba(255, 240, 220, 0)");
      gradient.addColorStop(0.4, "rgba(255, 240, 220, 0.18)");
      gradient.addColorStop(0.5, "rgba(255, 250, 240, 0.95)");
      gradient.addColorStop(0.6, "rgba(255, 240, 220, 0.18)");
      gradient.addColorStop(1, "rgba(255, 240, 220, 0)");
      context.fillStyle = gradient;
      if (horizontal) context.fillRect(0, half - 0.75, half * 2, 1.5);
      else context.fillRect(half - 0.75, 0, 1.5, half * 2);
    };
    arm(true);
    arm(false);
  });
}

export function HeroNebula({ card, className }: { card: RefObject<HTMLElement>; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const gasRef = useRef<HTMLCanvasElement>(null);
  const starRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const intro = useIntro();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = gasRef.current;
    const starCanvas = starRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    const built = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    if (!box || !canvas || !gl || !built) {
      setFallback(true);
      return;
    }
    const { program, dispose } = built;
    const starContext = starCanvas?.getContext("2d") ?? null;

    const uRes = gl.getUniformLocation(program, "uRes");
    const uPx = gl.getUniformLocation(program, "uPx");
    const uBase = gl.getUniformLocation(program, "uBase");
    const uUnit = gl.getUniformLocation(program, "uUnit");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uScroll = gl.getUniformLocation(program, "uScroll");
    const uIntro = gl.getUniformLocation(program, "uIntro");

    const halo = haloSprite();
    const spikes = spikeSprite();
    const scale = Math.min(window.devicePixelRatio || 1, 1) * GAS_SCALE;
    const starRatio = Math.min(window.devicePixelRatio || 1, STAR_RATIO);
    let geometry: Geometry = { width: 1, height: 1, base: 1, unit: 1, pageTop: 0 };
    let stars: Star[] = [];
    let frame = 0;
    let running = false;
    let onScreen = true;
    let gasAt = Number.NEGATIVE_INFINITY;
    let starsAt = Number.NEGATIVE_INFINITY;
    let drawnScroll = Number.NaN;
    const started = performance.now();

    const progress = () => {
      if (!intro || intro.done) return [1, 1];
      const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
      return [ease(intro.progress(INTRO.light)), ease(intro.progress(INTRO.steam))];
    };

    const measure = () => {
      const rect = box.getBoundingClientRect();
      const cardBox = card.current?.getBoundingClientRect();
      const width = Math.max(1, box.clientWidth);
      const height = Math.max(1, box.clientHeight);
      const base = cardBox ? cardBox.top - rect.top - HEART_ABOVE_CARD : height * 0.42;
      geometry = { width, height, base, unit: Math.min(700, Math.max(220, width * 0.33)), pageTop: rect.top + window.scrollY };
    };

    const resize = () => {
      measure();
      const { width, height, base, unit } = geometry;
      const pixelWidth = Math.max(1, Math.round(width * scale));
      const pixelHeight = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uPx, canvas.width / width);
      gl.uniform1f(uBase, base);
      gl.uniform1f(uUnit, unit);
      if (starCanvas && starContext) {
        starCanvas.width = Math.max(1, Math.round(width * starRatio));
        starCanvas.height = Math.max(1, Math.round(height * starRatio));
        starContext.setTransform(starRatio, 0, 0, starRatio, 0, 0);
        stars = scatterStars(geometry);
      }
    };

    const visibleBand = () => {
      const top = geometry.pageTop - window.scrollY;
      return [Math.max(0, -top), Math.min(geometry.height, window.innerHeight - top)];
    };

    const drawGas = (time: number, scroll: number, whole: boolean) => {
      if (whole) {
        gl.disable(gl.SCISSOR_TEST);
      } else {
        const [from, to] = visibleBand();
        if (to <= from) return;
        const ratio = canvas.height / geometry.height;
        const bottom = Math.max(0, Math.floor(canvas.height - to * ratio) - 2);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, bottom, canvas.width, Math.min(canvas.height - bottom, Math.ceil((to - from) * ratio) + 4));
      }
      const [light, steam] = progress();
      gl.uniform2f(uIntro, light, steam);
      gl.uniform1f(uTime, time);
      gl.uniform1f(uScroll, scroll);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const drawStars = (time: number, scroll: number) => {
      if (!starContext) return;
      const { width, height } = geometry;
      const [light] = progress();
      const shift = scroll * STAR_PARALLAX;
      starContext.clearRect(0, 0, width, height);
      if (light <= 0.01) return;
      for (const star of stars) {
        const y = star.y + shift;
        if (y > height) continue;
        const shine = star.alpha * (0.8 + 0.2 * Math.sin(time * 1000 * star.pace + star.phase)) * Math.min(1, light * 1.4) * Math.min(1, (height - y) / (height * 0.35));
        if (shine <= 0.01) continue;
        if (star.spikes > 0) {
          const reach = star.radius * 7;
          starContext.globalAlpha = shine * 0.5;
          starContext.drawImage(halo, star.x - reach, y - reach, reach * 2, reach * 2);
          starContext.globalAlpha = shine * 0.75;
          starContext.drawImage(spikes, star.x - star.spikes, y - star.spikes, star.spikes * 2, star.spikes * 2);
        }
        starContext.globalAlpha = shine;
        starContext.fillStyle = `rgb(${star.tint})`;
        starContext.beginPath();
        starContext.arc(star.x, y, star.radius, 0, Math.PI * 2);
        starContext.fill();
      }
      starContext.globalAlpha = 1;
    };

    const drawAll = (time: number, scroll: number) => {
      gasAt = starsAt = performance.now();
      drawnScroll = scroll;
      drawGas(time, scroll, true);
      drawStars(time, scroll);
    };

    const loop = () => {
      const now = performance.now();
      const scroll = window.scrollY;
      const every = scroll !== drawnScroll || (intro !== null && !intro.done);
      const time = (now - started) / 1000 + STILL_TIME;
      if (every || now - gasAt >= GAS_FRAME_MS) {
        gasAt = now;
        drawGas(time, scroll, false);
      }
      if (every || now - starsAt >= STAR_FRAME_MS) {
        starsAt = now;
        drawStars(time, scroll);
      }
      drawnScroll = scroll;
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
    const still = () => (reduced ? 0 : window.scrollY);

    resize();
    drawAll(STILL_TIME, still());
    start();

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(box);
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => {
      resize();
      drawAll(running ? (performance.now() - started) / 1000 + STILL_TIME : STILL_TIME, still());
    };
    document.addEventListener("visibilitychange", onVisibility);
    const layoutObserver = new ResizeObserver(onResize);
    [box, card.current].forEach((node) => node && layoutObserver.observe(node));
    return () => {
      stop();
      observer.disconnect();
      layoutObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      dispose();
    };
  }, [reduced, card, intro]);

  return (
    <div ref={boxRef} aria-hidden="true" className={cn("pointer-events-none absolute", className)}>
      {fallback ? (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: [
              "radial-gradient(60% 22% at 50% 44%, hsl(36 100% 70% / 0.32), transparent 70%)",
              "radial-gradient(28% 40% at 8% 46%, hsl(24 90% 45% / 0.28), transparent 70%)",
              "radial-gradient(28% 40% at 92% 50%, hsl(24 90% 45% / 0.24), transparent 70%)",
              "linear-gradient(to bottom, transparent 40%, hsl(24 30% 4% / 0.9) 58%, transparent 100%)",
            ].join(", "),
          }}
        />
      ) : (
        <>
          <canvas ref={starRef} className="absolute inset-0 h-full w-full" />
          <canvas ref={gasRef} className="absolute inset-0 h-full w-full" />
        </>
      )}
    </div>
  );
}
