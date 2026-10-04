/**
 * The new landing page's hero sky: a total solar eclipse standing over the night side of a planet - the horizon mark,
 * the app's logo (a dark core with a fine ring on a horizon line under a dome of light), drawn as the real thing.
 *
 * Handles: compiling the eclipse's shader, sizing its canvas to its box and placing the moon and the planet's limb in
 * it, the opening (the limb's line of light drawing outwards from under the moon, the ring of totality brightening,
 * then the corona reaching out), dimming and sinking as the page moves on - read from the box's own position, or
 * written by the section that pins it (scene: dim, and sink, which carries the moon and the planet down the screen as
 * a camera tilting up would) - the frame loop and its throttling, and a plain gradient stand-in where WebGL is not to
 * be had.
 *
 * The corona is built the way photographs of totality look. Its brightness falls away from the moon's edge as the
 * measured corona does (Baumbach's sum of r^-17, r^-7 and r^-2.5 terms), and is shown through a photographic curve
 * (a 0.42 power, then 1 - exp), so the inner corona burns pearl-white and the outer streamers still read several
 * radii out. On that falloff sits the structure of a corona near solar minimum, tilted a little as the sun's magnetic
 * equator is: two long helmet streamers along the equator and a few weaker ones beside them - each with a bulb at its
 * base that narrows into a pointed stalk, with flat-topped, sharp-sided profiles rather than soft wedges, gaining on
 * the falloff with height so they carry the outer corona - and fans of fine polar plumes, sampled at a footpoint that
 * bends towards the equator with height, as field lines spreading from the poles do. Through all of it run filaments
 * at three scales, drawn from a noise stretched along the rays and slid outwards in log-radius over time (FLOW), so
 * the fine structure streams slowly away from the sun as a coronagraph's time-lapse shows the solar wind doing - still
 * at a glance, plainly alive when watched. The very edge carries the ring of totality and a hairline of rose
 * chromosphere with two small prominences, arches standing on the limb. The colour goes from pearl at the edge to pale
 * gold outward; nothing in it is saturated, since saturated yellow in a bright core read as flame on the old nebula
 * hero. The first version's streamers were soft, wide wedges with coarse stripes through them, which read as a
 * sunburst; they were narrowed and the coarse stripes turned down before the filaments went in.
 *
 * The moon is a plain dark disc, faintly lit by earthshine from one side, opaque - it hides the stars behind it. The
 * planet is a sphere seen side-on, its limb a gentle arc: its night side carries the gold lights of cities - clustered
 * into metropolitan sprawl on land, a few bright cores with dimmer haze round them, squeezed flat towards the limb by
 * the sphere's own foreshortening and dimmed there by the air they are seen through - under slow clouds that hide some
 * of them and catch a little of the corona's light, all turning with the planet (SPIN). Above the limb lies its air:
 * a thin rim brightest and palest gold under the eclipse, cooling to ice blue along the horizon, a little glow above
 * it, and higher a faint band of airglow rippling with slow gravity waves, as it does in photographs from orbit. Now
 * and then (METEOR_EVERY, two lanes, some cycles skipped so the rhythm is irregular) a meteor burns up in that air - a
 * hot head with a short gold trail that flares, then fades in under a second - the page's first falling light, which
 * the build section's files later echo. When the hero is not pinned (a phone, reduced motion) the planet thins into
 * the night towards the foot of its box (fade) rather than ending on the canvas's hard edge. Everything that is light
 * is written as light over the sky (premultiplied, alpha from its brightness), so the sky's stars sit behind the
 * corona and fade where it is bright, as they would.
 *
 * Geometry is in CSS pixels and comes from eclipse.ts: the moon's radius follows the viewport within limits, the limb
 * sits a fixed share down the box and the moon's centre a little over a radius above it. The canvas renders at
 * RENDER_SCALE of the device pixels (the corona is soft; the limb's hairline survives the stretch), redraws every
 * frame while the opening plays or the page scrolls, about 30 times a second otherwise, only while it is on screen
 * and the tab is visible, and under reduced motion draws one finished frame. The opening reads the page's intro clock
 * (intro.ts) through DAWN's phases, so it stays in step with the headline and the navigation.
 */
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";
import { FULLSCREEN_VERTEX, createProgram } from "@/components/landing/glsl";
import { useIntro } from "@/components/landing/intro";
import { usePrefersReducedMotion } from "@/components/landing/motion";
import { DAWN } from "@/components/landing-next/dawn";
import { eclipseGeometry, type EclipseScene } from "./eclipse";

const RENDER_SCALE = 0.75;
const FRAME_MS = 33;
const STILL_TIME = 24;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uPx;
uniform vec2 uCenter;
uniform float uR;
uniform float uHorizon;
uniform float uWidth;
uniform float uTime;
uniform vec3 uIntro;
uniform float uDim;
uniform float uFade;

const float PI = 3.14159265;
const float TAU = 6.2831853;
const float TILT = 0.21;
const float FLOW = 0.04;
const float SPIN = 0.00075;
const float METEOR_EVERY = 5.5;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float near = mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y);
  float back = mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y);
  return mix(near, back, u.z);
}

float around(float a, float k, vec2 offset) { return noise(vec2(cos(a), sin(a)) * k + offset); }

float turn(float a, float b) { return mod(a - b + PI, TAU) - PI; }

float streamer(float a, float r, float at, float width, float gain) {
  float bulb = 1.0 + 0.9 * exp(-pow((r - 1.45) / 0.4, 2.0));
  float w = width * bulb / (1.0 + 0.65 * (r - 1.0));
  return gain * exp(-pow(abs(turn(a, at) / w), 2.6));
}

float prominence(float a, float r, float at, float spread, float height) {
  float d = turn(a, at) / spread;
  if (abs(d) >= 1.0) return 0.0;
  float arch = height * sqrt(1.0 - d * d);
  float strand = exp(-pow((r - 1.0 - arch) / 0.0075, 2.0));
  float veil = exp(-pow((r - 1.0 - arch * 0.55) / (arch * 0.5 + 0.004), 2.0)) * 0.25;
  return (strand + veil) * (0.65 + 0.35 * noise(vec2(d * 6.0, r * 40.0)));
}

vec3 meteors(vec2 css, float t, float planet, float rp) {
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    float lane = float(k);
    float period = METEOR_EVERY + lane * 2.3;
    float clock = t + lane * 3.1;
    float cycle = floor(clock / period);
    float local = clock - cycle * period;
    if (local > 0.95 || hash(vec2(cycle, lane * 7.0 + 1.0)) < 0.3) continue;
    float s1 = hash(vec2(cycle, lane + 3.0));
    float s2 = hash(vec2(cycle, lane + 5.0));
    float x0 = uCenter.x + (s1 - 0.5) * uWidth * 0.84;
    float dx0 = x0 - uCenter.x;
    float limb0 = planet - sqrt(max(0.0, rp * rp - dx0 * dx0));
    vec2 start = vec2(x0, limb0 - 8.0 - 20.0 * s2);
    vec2 dir = normalize(vec2((s1 < 0.5 ? 1.0 : -1.0) * (0.62 + 0.3 * s2), 0.5));
    vec2 head = start + dir * (80.0 + 70.0 * s2) * (local / 0.95);
    vec2 v = css - head;
    float along = dot(v, -dir);
    float side = abs(v.x * dir.y - v.y * dir.x);
    float flare = smoothstep(0.0, 0.12, local) * (1.0 - smoothstep(0.5, 0.95, local));
    float trail = exp(-pow(side / 0.85, 2.0)) * (along >= 0.0 ? exp(-along / 24.0) : exp(-pow(along / 1.4, 2.0)));
    float core = exp(-dot(v, v) / 7.0);
    sum += (vec3(1.0, 0.68, 0.34) * trail * 0.75 + vec3(1.0, 0.95, 0.86) * core) * flare;
  }
  return sum;
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uPx;
  vec2 p = (css - uCenter) / uR;
  p.y = -p.y;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime;
  float light = 1.0 - 0.82 * uDim;

  float rp = uWidth * 4.5;
  float planet = uHorizon + rp;
  vec2 rel = css - vec2(uCenter.x, planet);
  float above = length(rel) - rp;
  float dx = css.x - uCenter.x;
  float reach = uIntro.x * uWidth * 0.62;
  float drawn = 1.0 - smoothstep(reach, reach + 140.0, abs(dx));
  float near = exp(-abs(dx) / (uWidth * 0.2));
  float far = exp(-abs(dx) / (uWidth * 0.85));

  vec3 col = vec3(0.0);

  if (r > 0.995) {
    float base = 1.425 * pow(r, -7.0) + 0.0532 * pow(r, -2.5);
    float edge = 2.565 * pow(r, -17.0);

    float pole = turn(a, TILT + 0.5 * PI);
    if (abs(pole) > 0.5 * PI) pole = turn(a, TILT - 0.5 * PI);
    float rise = 1.0 - exp(-(r - 1.0) * 1.2);
    float foot = a - 0.22 * rise * sin(2.0 * pole);
    float polar = exp(-pow(pole / 0.55, 2.0));

    float s = streamer(foot, r, TILT + 0.05, 0.2, 1.0)
      + streamer(foot, r, TILT + PI - 0.08, 0.23, 0.9)
      + streamer(foot, r, TILT + 0.62, 0.11, 0.3)
      + streamer(foot, r, TILT - 0.55, 0.1, 0.24)
      + streamer(foot, r, TILT + PI + 0.58, 0.1, 0.28)
      + streamer(foot, r, TILT + PI - 0.7, 0.12, 0.22);

    vec2 ring = vec2(cos(foot), sin(foot));
    float drift = log(r) - t * FLOW;
    float fil = noise3(vec3(ring * 30.0, drift * 3.2));
    float strand = noise3(vec3(ring * 11.0 + 7.0, drift * 1.6));
    float knot = noise3(vec3(ring * 6.0 + 3.0, drift * 4.5));
    float coarse = around(foot, 1.6, vec2(5.0, 9.0));

    float close = exp(-(r - 1.0) * 1.2);
    float striation = 0.8 + 0.32 * (fil - 0.5) * (0.45 + 0.55 * close) + 0.22 * (strand - 0.5) + 0.1 * (coarse - 0.5);
    float plumes = polar * (0.5 + 1.0 * pow(fil, 1.8)) * exp(-(r - 1.0) * 0.9);
    float structure = striation * (0.55 + s * (0.9 + 1.25 * (r - 1.0)) + plumes) * (0.86 + 0.28 * knot);

    float grow = 1.02 + 8.0 * pow(uIntro.z, 2.2);
    float front = 1.0 - smoothstep(grow - 0.35 * (grow - 1.0), grow, r);
    float outer = exp(-pow((r - 1.0) / 4.0, 2.0));
    float level = (base * structure * front * outer + edge * uIntro.y) / 4.0;
    float lum = 1.0 - exp(-2.3 * pow(max(level, 0.0), 0.42));
    vec3 tone = mix(vec3(1.0, 0.84, 0.58), vec3(1.0, 0.975, 0.94), exp(-(r - 1.0) * 1.4));
    col = tone * lum * light;

    float chromo = exp(-pow((r - 1.0) / 0.006, 2.0)) * (0.6 + 0.4 * around(a, 5.0, vec2(1.7, 4.2)));
    float prom = prominence(a, r, 3.65, 0.07, 0.05) + 0.8 * prominence(a, r, 5.6, 0.045, 0.032);
    col += vec3(1.0, 0.42, 0.36) * (chromo * 0.5 + prom * 0.85) * uIntro.y * light;
  }

  float disc = clamp((1.0 - r) * uR * uPx + 0.5, 0.0, 1.0);
  if (disc > 0.0) {
    vec3 normal = normalize(vec3(p, sqrt(max(0.0, 1.0 - r * r))));
    float earthshine = 0.7 + 0.3 * dot(normal, normalize(vec3(-0.45, -0.5, 0.74)));
    float maria = 0.86 + 0.14 * noise(p * 3.2 + 4.0);
    vec3 moon = vec3(0.015, 0.016, 0.02) * earthshine * maria;
    col = mix(col, moon, disc);
  }

  if (above > 0.0) {
    float glow = exp(-pow(above / 1.15, 2.0)) * (0.1 * far + 0.95 * near)
      + exp(-above / 16.0) * (0.035 * far + 0.3 * near)
      + exp(-above / 70.0) * 0.07 * near;
    vec3 air = mix(vec3(0.5, 0.68, 1.0), vec3(1.0, 0.9, 0.7), near);
    float wave = 0.62 + 0.38 * sin(dx * 0.021 + t * 0.22 + 1.7 * sin(dx * 0.0047 - t * 0.05));
    float airglow = exp(-pow((above - 7.5) / 2.4, 2.0)) * 0.09 * wave * (0.3 + 0.7 * far);
    col += (air * glow + vec3(0.52, 0.78, 1.0) * airglow) * drawn * light;
  }

  float deep = max(1.0, uRes.y / uPx - uHorizon);
  float ground = clamp(-above * uPx + 0.5, 0.0, 1.0) * (1.0 - uFade * smoothstep(0.3 * deep, deep, -above));
  if (ground > 0.0) {
    vec2 q = rel / rp;
    float z = sqrt(max(0.0, 1.0 - dot(q, q)));
    float c = cos(t * SPIN);
    float sn = sin(t * SPIN);
    vec3 n = vec3(q.x * c + q.y * sn, q.x * sn - q.y * c, z);
    float graze = smoothstep(0.0, 0.16, z);
    float land = smoothstep(0.47, 0.6, noise3(n * 7.0) * 0.65 + noise3(n * 19.0) * 0.35);
    float metro = smoothstep(0.5, 0.86, noise3(n * 46.0 + 11.0));
    float spark = pow(noise3(n * 190.0 + 23.0), 9.0) * 5.0;
    float haze = smoothstep(0.55, 0.95, noise3(n * 95.0 + 5.0)) * 0.35;
    float overcast = smoothstep(0.5, 0.72, noise3(n * 16.0 + vec3(0.0, 0.0, t * 0.002)) * 0.6 + noise3(n * 41.0 + t * 0.003) * 0.4);
    float city = land * metro * (spark + haze) * (1.0 - 0.85 * overcast) * graze * drawn;
    vec3 lights = mix(vec3(1.0, 0.62, 0.26), vec3(1.0, 0.9, 0.7), clamp(spark * 0.4, 0.0, 1.0)) * city * 0.55;
    vec3 tops = vec3(0.8, 0.77, 0.72) * overcast * 0.03 * (0.25 + near) * graze * drawn;
    vec3 rim = vec3(0.06, 0.045, 0.03) * exp(max(above, -60.0) / 9.0) * (0.15 + near) * drawn;
    vec3 body = vec3(0.0105, 0.0098, 0.0092) + (lights + tops + rim) * light;
    col = mix(col, body, ground);
  }

  col += meteors(css, t, planet, rp) * uIntro.x * light;

  float alpha = max(max(disc, ground), clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0 * step(0.003, alpha);
  gl_FragColor = vec4(col, alpha);
}
`;

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);

export function Corona({ className, scene }: { className?: string; scene?: MutableRefObject<EclipseScene> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const intro = useIntro();
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
    const built = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    if (!box || !canvas || !gl || !built) {
      setFallback(true);
      return;
    }
    const { program, dispose } = built;
    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uRes = uniform("uRes");
    const uPx = uniform("uPx");
    const uCenter = uniform("uCenter");
    const uR = uniform("uR");
    const uHorizon = uniform("uHorizon");
    const uWidth = uniform("uWidth");
    const uTime = uniform("uTime");
    const uIntro = uniform("uIntro");
    const uDim = uniform("uDim");
    const uFade = uniform("uFade");

    const scale = Math.min(window.devicePixelRatio || 1, 2) * RENDER_SCALE;
    let geometry = eclipseGeometry(1, 1);
    let frame = 0;
    let running = false;
    let onScreen = true;
    let drawnAt = Number.NEGATIVE_INFINITY;
    let drawnScroll = Number.NaN;
    const started = performance.now();

    const opening = (): [number, number, number] => {
      if (!intro || intro.done) return [1, 1, 1];
      return [easeInOut(intro.progress(DAWN.limb)), easeOut(intro.progress(DAWN.ring)), easeOut(intro.progress(DAWN.corona))];
    };

    const resize = () => {
      const width = Math.max(1, box.clientWidth);
      const height = Math.max(1, box.clientHeight);
      geometry = eclipseGeometry(width, height);
      const pixelWidth = Math.max(1, Math.round(width * scale));
      const pixelHeight = Math.max(1, Math.round(height * scale));
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uPx, canvas.width / width);
      gl.uniform1f(uR, geometry.radius);
      gl.uniform1f(uWidth, width);
    };

    const draw = (time: number) => {
      const pinned = scene?.current;
      let dim = 0;
      let sink = 0;
      if (pinned) {
        dim = pinned.dim;
        sink = pinned.sink;
      } else if (!reduced) {
        dim = Math.min(1, Math.max(0, -box.getBoundingClientRect().top / (geometry.height * 0.7)));
      }
      const [limb, ring, corona] = opening();
      gl.uniform2f(uCenter, geometry.centerX, geometry.centerY + sink);
      gl.uniform1f(uHorizon, geometry.horizon + sink);
      gl.uniform1f(uFade, pinned ? 0 : 1);
      gl.uniform3f(uIntro, limb, ring, corona);
      gl.uniform1f(uDim, dim);
      gl.uniform1f(uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const loop = () => {
      const now = performance.now();
      const scroll = window.scrollY;
      const every = scroll !== drawnScroll || (intro !== null && !intro.done);
      if (every || now - drawnAt >= FRAME_MS) {
        drawnAt = now;
        drawnScroll = scroll;
        draw((now - started) / 1000 + STILL_TIME);
      }
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
    draw(STILL_TIME);
    start();

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) start();
      else stop();
    });
    observer.observe(box);
    const onVisibility = () => (document.hidden ? stop() : start());
    const layout = new ResizeObserver(() => {
      resize();
      draw(running ? (performance.now() - started) / 1000 + STILL_TIME : STILL_TIME);
    });
    layout.observe(box);
    const onScrollStill = () => reduced && draw(STILL_TIME);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScrollStill, { passive: true });
    return () => {
      stop();
      observer.disconnect();
      layout.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScrollStill);
      dispose();
    };
  }, [reduced, intro, scene]);

  return (
    <div ref={boxRef} aria-hidden="true" className={cn("pointer-events-none absolute", className)}>
      {fallback ? (
        <div className="corona-fallback absolute inset-0" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}
