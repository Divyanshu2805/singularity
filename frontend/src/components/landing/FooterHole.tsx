/**
 * The black hole above the footer: the upper half of a hole standing on the footer's top edge, a copy of the one that
 * closes reflect.app's home page (which is violet; this one keeps its shapes and motion and is painted in the app's
 * ember-to-gold ramp, tone) - a still dark core inside a thick white photon ring, a band of pale gold, then the
 * accretion disk's far side bent up and over the hole as a white dome that falls down both flanks in an S-curve and
 * runs out along a bright horizon line, and round it a wide amber haze - with an edge of light and thin white
 * threads moving out through the dome and trailing round its left flank.
 *
 * Handles: compiling the shader, sizing the hole to its box (HEIGHT radii tall, the hole's centre CUT of a radius
 * above the box's bottom edge, which is where the reference's section crops its video - just under the horizon
 * line), tracing each pixel through the lens to the disk, drawing the moving light, colouring the result, running
 * the frame loop only while the hole is on screen and the tab is visible, fading the whole thing up the first time it
 * scrolls into view, and scattering falling stars round it (HoleStars), cut off with everything else.
 *
 * Every number in the shader is measured from the reference's own video (a 5 second loop), read frame by frame in
 * the browser, not judged by eye. The first version of this was built from a screenshot, before the video could be
 * loaded, and the owner sent it back: it was ringed like an onion, its core rippled, and its light ran round the dome
 * - none of which the reference does. What the video actually shows:
 *
 * The shape. A pixel at impact distance b from the hole's centre is bent towards it by a weak-field term plus a steep
 * one near the photon ring, followed down to the disk's plane (tilted about 2.4 degrees towards the viewer) and lit
 * by the disk's emission at the radius it lands on, plus a haze that depends on b alone and a ring at b = 1. Those
 * numbers are a least-squares fit of the model to the average of the video's frames, which it matches to about 1.5
 * levels in 255. It is the model of the black hole the hero had until 2026-10-03 (BlackHole, replaced by HeroNebula) with its
 * own fit: the hero's was fitted to screenshots, then turned down and thickened at the owner's request. The band of lilac between the ring and the dome at the crown is
 * just where the ring has faded and the disk has not yet begun - a shade added there by hand drew a dark outline the
 * reference does not have.
 *
 * The base, which the fit does not reach (it stops a little above the hole's centre) and the owner pointed at twice
 * as not matching, is laid out from the video's own rows. The ring's feet come straight down. Outside each is a soft
 * pocket of pale gold between the ring and the foot of the dome (pocket) - wider, further out and deeper on the right
 * than on the left, closing by about a quarter of a radius up; an early version shaded it almost to black, which read
 * as a notch. The bright line across the front of the hole is not on its centre: it is the inner edge of the disk's
 * near side, seen almost edge-on, LINE_Y below the centre in the middle and bowing up to meet the skirt past the
 * ring's feet; it is a pixel or two thick above with a faint glow, and falls away slowly beneath. Past the feet there
 * is no line, only the skirt, which fades beneath the centre line faster on the right than on the left (under).
 *
 * The core. It is a still, radially even glow - dimmest at the middle, rising to the ring - and nothing in it moves
 * (under 0.6 levels of change across the whole loop), so it is drawn with no time in it.
 *
 * The motion, which took several attempts, each sent back by the owner. The first had the light running round the
 * dome in lengths; the second had even bands flowing straight out ("I can't see the rays rotating because of
 * homogeneity"); the third had one evenly spaced comb of identical lines ("they are a lot different"). What settled
 * it was saving this shader's frames to disk and putting them through the same analysis as a recording of the
 * reference - mean frame, residuals, space-time diagrams, contrast by radius - until the two sets of pictures agreed.
 * The mean frames agreed from early on; everything that differed was in how the light changes. What the video does:
 *
 * A broad swell. Every point repeats one profile a loop (swellAt): dark, a rise, a long bright shelf, a sharp fall.
 * Seen in space that is a crisp edge moving outwards with the dome dim behind it and bright ahead. When a point
 * reaches each moment of the profile is its phase: it grows with the log of the disk radius the lens lands on,
 * quickly through the dome's body and levelling off in the haze, so less than one wave is ever on show (several
 * were, at first, and read as rings round the dome), and with the angle round the disk past the far point on the left
 * (LAG, levelling off towards the horizon, where an unbounded lag fanned the lines out into a spray) and barely on
 * the right (LEAD). The top of the dome is only a few degrees of the disk, hugely magnified, so there the light just
 * moves out; down the left flank the angle opens up and everything arrives later the further down it is, which is
 * what makes it look as if it runs round the hole anticlockwise.
 *
 * Thin lines (threads), riding out on the same phase: bright ones and dark ones at irregular spacings, at every
 * radius from just outside the ring to where the dome ends - not a comb on the bright shelf. Each is lit only along
 * part of its arc and only for a second or so, by patches of a slow noise (life) that drift anticlockwise (SPIN), so
 * the lines come and go as they travel and the light on them moves round the dome. They are read in a copy of the
 * lens lifted a little (LIFT): read in the lens itself, lines meeting the horizon turned upright and stood along
 * it like a comb.
 *
 * Four things are the owner's and not the video's. The whole picture is a little dimmer (DIM, which scales every
 * light just before it is turned into a level, so nothing fitted has to change) - "reduce the brightness of both
 * black holes a bit", the hero's being turned down by the same share, and then asked once more (0.88, now 0.78), and then for the centre in particular to be dimmer (CENTRE: a quarter off the
 * core, the ring and the bright line, fading back to nothing over about 0.7 radii out). The loop is faster (PERIOD; the video's is 5.04 s) - "increase the
 * speed of rotation". The swell and the lines stop sooner than the video's (swell, fine) - "reduce the distance till
 * which it expands and fades". And the skirt along the horizon is shorter and the dome's foot flares out less than
 * the video's (reach, foot) - "reduce the flare out near the ring on the horizontal plane and overall".
 *
 * Along the bright line in front of the hole a faint variation drifts from left to right through the centre (front,
 * DRIFT), as the video's near side does; a stronger one over the whole strip under the centre line showed as
 * upright bars.
 *
 * The colour is the video's own, not the page's ramp: a level is turned into the colour the video has at that
 * brightness (tone - amber through the haze, pale gold and gold-white in the dome, white at the ring), which is one
 * curve for the whole picture, core included. It is written as light added to the sky, so the page's stars show
 * through the haze as the reference's do, turning opaque where it is bright and inside the core. It fades out
 * through the same ellipse the reference masks its video with, and at the box's top.
 *
 * It renders at up to 1.5 device pixels per CSS pixel (the hero uses one; the lines here are finer), as one
 * full-canvas quad. Under reduced motion one finished frame is drawn and left, and without WebGL a plain CSS glow
 * stands in.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { HoleStars } from "./HoleStars";
import { FULLSCREEN_VERTEX, createProgram } from "./glsl";
import { useInView, usePrefersReducedMotion } from "./motion";

const RADIUS_CSS = "clamp(58px, 7.4vw, 110px)";
const HEIGHT = 4.4;
const CUT = 0.078;
const STILL_AT = 4;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uRadius;
uniform vec2 uCenter;

const float PERIOD = 3.4;
const float SPIN = 1.5;
const float LAG = 5.1;
const float LEAD = 0.6;
const float DRIFT = 0.7;
const float LINE_Y = -0.058;
const float LIFT = 0.09;
const float DIM = 0.78;
const float CENTRE = 0.25;
const vec3 SKY = vec3(0.027, 0.030, 0.043);

float hash1(float n) { return fract(sin(n * 127.1 + 3.7) * 43758.5453); }

float strand(float x, float cells) {
  float i = floor(x), f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash1(mod(i, cells)), hash1(mod(i + 1.0, cells)), u) * 2.0 - 1.0;
}

float swellAt(float q) {
  float base = -1.0 + 1.15 * smoothstep(0.12, 0.32, q) + 0.55 * smoothstep(0.3, 0.62, q) - 0.25 * smoothstep(0.76, 0.86, q);
  return mix(base, -1.0, smoothstep(0.85, 0.97, q)) - 0.02;
}

float cell(vec2 i) { return fract(sin(dot(mod(i, 64.0), vec2(127.1, 311.7))) * 43758.5453); }

float patch(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cell(i), cell(i + vec2(1.0, 0.0)), u.x), mix(cell(i + vec2(0.0, 1.0)), cell(i + vec2(1.0, 1.0)), u.x), u.y);
}

float threads(float q) {
  float lines = pow(1.0 - abs(strand(q * 23.0 + 0.37, 23.0)), 3.0) - 0.25;
  float cuts = pow(1.0 - abs(strand(q * 31.0 + 5.1, 31.0)), 4.0) - 0.2;
  return 1.1 * lines - 0.6 * cuts + 0.35 * strand(q * 9.0 + 2.3, 9.0);
}

vec3 tone(float g) {
  vec3 c = mix(SKY, vec3(0.11, 0.04, 0.02), clamp(g / 0.089, 0.0, 1.0));
  c = mix(c, vec3(0.24, 0.075, 0.02), clamp((g - 0.089) / 0.103, 0.0, 1.0));
  c = mix(c, vec3(0.42, 0.12, 0.02), clamp((g - 0.192) / 0.116, 0.0, 1.0));
  c = mix(c, vec3(0.60, 0.19, 0.025), clamp((g - 0.308) / 0.103, 0.0, 1.0));
  c = mix(c, vec3(0.78, 0.28, 0.035), clamp((g - 0.411) / 0.082, 0.0, 1.0));
  c = mix(c, vec3(0.93, 0.40, 0.06), clamp((g - 0.493) / 0.092, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.55, 0.12), clamp((g - 0.585) / 0.104, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.70, 0.26), clamp((g - 0.689) / 0.118, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.83, 0.48), clamp((g - 0.807) / 0.087, 0.0, 1.0));
  c = mix(c, vec3(1.0, 0.94, 0.78), clamp((g - 0.894) / 0.074, 0.0, 1.0));
  return mix(c, vec3(1.0), clamp((g - 0.968) / 0.032, 0.0, 1.0));
}

void main() {
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
  float b = length(p) + 1e-5;
  float ax = abs(p.x);
  float right = step(0.0, p.x);
  float beat = mod(uTime, PERIOD) / PERIOD + 0.592;
  float front = 1.0 + 0.1 * strand(p.x * 0.9 - mod(uTime * DRIFT * 0.9, 32.0), 32.0);

  float light = 0.0;
  if (b >= 1.0) {
    float y = max(p.y, 1e-4);
    float bend = 0.704 / b + 2.7406 * exp(-(b - 1.0) / 0.1187);
    float zd = y / (0.0426 + y * bend / b);
    float xd = p.x * (1.0 - bend * zd / b);
    float rd = max(length(vec2(xd, zd)), 0.05);
    float onset = mix(pow(clamp((rd - 0.8) / 2.684, 0.0, 1.0), 1.6), clamp((rd - 0.9194) / 2.5646, 0.0, 1.0), smoothstep(1.0, 1.6, rd));
    float disk = 0.6977 * pow(rd / 3.484, -3.8847) * onset;
    float halo = 2.2691 * exp(-(b - 1.0) / 0.6484) + 0.5971 * exp(-(b - 1.0) / 0.0397);
    float foot = 1.2 + mix(0.15, 0.28, right) * exp(-y / 0.14);
    float pocket = 1.0 - 0.22 * right * exp(-pow((b - 1.3) / 0.12, 2.0)) * (1.0 - smoothstep(0.1, 0.3, y));
    float under = p.y < 0.0 ? exp(p.y / mix(0.3, 0.09, right)) : 1.0;
    float reach = 1.0 - (1.0 - smoothstep(0.15, 0.6, y)) * smoothstep(1.5, 3.0, ax);

    float yt = p.y + LIFT;
    float zt = yt / (0.0426 + yt * bend / b);
    float xt = p.x * (1.0 - bend * zt / b);
    float lr = log(max(length(vec2(xt, zt)), 0.05));
    float turn = atan(zt, xt) - 1.5708;
    float lag = turn > 0.0 ? LAG * 0.75 * (1.0 - exp(-turn / 0.75)) : -LEAD * turn;
    float swell = 0.1 * smoothstep(0.7, 1.1, lr) * (1.0 - smoothstep(1.7, 2.05, lr)) + 0.16 * exp(-pow((lr - 1.5) / 0.26, 2.0));
    float fine = (0.135 - 0.085 * smoothstep(0.9, 1.7, lr)) * smoothstep(-0.1, 0.45, lr) * (1.0 - smoothstep(1.6, 2.0, lr)) * smoothstep(-0.03, 0.12, p.y);
    float q = fract(beat - (5.1 - 4.95 * exp(-(max(lr, 1.0) - 1.16) / 0.36) + 7.0 * (min(lr, 1.0) - 1.0) + lag) / 6.2832);
    float life = 0.3 + 1.4 * smoothstep(0.25, 0.75, patch(vec2(lr * 3.0 + 7.0, atan(p.x, p.y) * 1.2 + mod(uTime * SPIN, 64.0))));
    light = (disk * reach * smoothstep(foot - 0.1, foot + 0.04, b) + halo * pocket) * under * (1.0 + swell * swellAt(q) + fine * life * threads(q))
      + 2.8 * exp(-pow((b - 1.0) / 0.082, 2.0));
  } else {
    light = 0.585 + 0.49 * b * b + 2.75 * exp(-(1.0 - b) / 0.12);
  }

  float off = p.y - LINE_Y * max(1.0 - pow(ax / 1.45, 4.0), 0.0);
  float line = off > 0.0 ? 3.4 * exp(-pow(off / 0.008, 2.0)) + 0.6 * exp(-off / 0.02) : 4.0 * exp(off / 0.08);
  light += line * (1.0 - smoothstep(1.45, 1.8, ax)) * (1.0 - 0.4 * right * smoothstep(1.0, 1.5, ax)) * front;

  float g = 1.0 - exp(-light * DIM * (1.0 - CENTRE * exp(-max(b - 1.0, 0.0) / 0.7)));
  vec3 col = tone(g);
  float cover = b < 1.0 ? 1.0 : smoothstep(0.3, 0.75, g);
  vec2 uv = gl_FragCoord.xy / uResolution;
  float fade = (1.0 - smoothstep(0.61, 1.0, length(vec2(p.x / 6.7, (p.y - 1.4) / 3.8))))
    * smoothstep(0.0, 1.0, (uResolution.y - gl_FragCoord.y) / uRadius) * smoothstep(0.0, 0.04, uv.x) * smoothstep(1.0, 0.96, uv.x);
  gl_FragColor = vec4(mix(max(col - SKY, 0.0), col, cover) * fade, cover * fade);
}
`;

export function FooterHole({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const [boxRef, shown] = useInView<HTMLDivElement>({ threshold: 0.2, rootMargin: "0px" });
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
    const uRadius = gl.getUniformLocation(program, "uRadius");
    const uCenter = gl.getUniformLocation(program, "uCenter");

    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const started = performance.now();
    let frame = 0;
    let running = false;
    let onScreen = false;

    const resize = () => {
      const pixelWidth = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const pixelHeight = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const radius = canvas.height / HEIGHT;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uRadius, radius);
      gl.uniform2f(uCenter, canvas.width / 2, CUT * radius);
    };

    const render = (time: number) => {
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
    render(STILL_AT);

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(canvas);
    const onVisibility = () => (document.hidden ? stop() : start());
    const sizes = new ResizeObserver(() => {
      resize();
      render(running ? (performance.now() - started) / 1000 : STILL_AT);
    });
    sizes.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      observer.disconnect();
      sizes.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      dispose();
    };
  }, [reduced]);

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      data-shown={shown || reduced}
      className={cn("footer-hole pointer-events-none relative overflow-hidden", className)}
      style={{ height: `calc(${HEIGHT} * ${RADIUS_CSS})` } as CSSProperties}
    >
      <HoleStars size={`calc(6.4 * ${RADIUS_CSS})`} centerY={`calc(100% - ${CUT} * ${RADIUS_CSS})`} />
      {fallback ? <div className="footer-hole-still absolute inset-0" /> : <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}
    </div>
  );
}
