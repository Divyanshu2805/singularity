/**
 * The comet that lights the build orbit: a falling star that comes down out of the sky as the visitor scrolls,
 * strikes the top of the orbit's planet and leaves its light there, which then runs on round the rim (orbitRay.ts).
 *
 * Handles: sizing a canvas to the viewport, and painting one frame of the comet on it with a fragment shader - a
 * small white-hot head in a soft coma, drawn out behind into a teardrop; a thin bright streak behind it that narrows
 * to nothing; a fainter tail of dust that widens and thins the further it trails; a few sparks shed along the way,
 * left behind where they fell and fading as the head moves on; the tail being drawn into the point of impact once
 * the head has landed; and a short bloom of light on the rim where it struck, which runs out along the rim's own
 * curve to either side as it fades.
 *
 * Everything is given, nothing is kept: how far through its fall the comet is, how much of the tail has been drawn
 * in, how bright the bloom is and where the planet's top is on screen this frame. The orbit works those out from the
 * scroll position, so scrolling back up runs the fall backwards - the sparks included, since each sits at a fixed
 * place along the path and is lit only while the tail is passing over it. The path is a curve from above the top
 * edge of the screen, to the left of the planet, down to the point of impact: it starts shallow and steepens, as
 * something falling towards a planet does, and arrives heading down and to the right - the way the light then sets
 * off round the rim. Because the point of impact rises with the page while the comet comes down, the two close on
 * each other.
 *
 * It is one field of light turned into colour by the gold ramp (glsl.ts), exactly as the planet's rim is, so the
 * comet, the bloom and the light they leave on the rim are one colour at every brightness. The first version was
 * drawn on a 2D canvas in colours of its own: its tail was a row of round-ended strokes that showed as beads, its
 * faint parts went grey, and the owner asked why the flare on the rim was orange when the comet was yellow. The
 * canvas is as large as the screen but only the box round the comet is shaded each frame (a scissor), so the shader
 * is not paid for across the whole screen. The tail's curve is handed to the shader as a short run of points and
 * each pixel finds the nearest stretch of it. The bloom is kept small and brief: a wide white splash where the first
 * landing page's beam landed was turned down as a "blast". Without WebGL there is no comet, and the rim simply
 * lights.
 */
import { FULLSCREEN_VERTEX, GOLD_RAMP_GLSL, createProgram } from "./glsl";

export type Comet = {
  resize: () => void;
  draw: (fall: number, spent: number, flash: number, target: { x: number; y: number }, radius: number, time: number) => void;
  clear: () => void;
};

const REACH = 0.36;
const MAX_REACH = 620;
const START_Y = -70;
const TAIL = 0.44;
const POINTS = 20;
const MARGIN = 70;
const BLOOM_REACH = { x: 460, y: 150 };

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uPx;
uniform vec3 uPath[${POINTS}];
uniform vec2 uHead;
uniform vec2 uDir;
uniform float uFall;
uniform float uTail;
uniform float uBody;
uniform vec2 uTarget;
uniform float uRadius;
uniform float uFlash;
uniform float uTime;
${GOLD_RAMP_GLSL}

float hash(float n) { return fract(sin(n * 127.1 + 311.7) * 43758.5453); }

void main() {
  vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y) / uPx;
  float light = 0.0;

  if (uBody > 0.0) {
    float d = 1.0e6;
    float along = uFall;
    float side = 0.0;
    float pace = 1.0;
    for (int i = 0; i < ${POINTS - 1}; i++) {
      vec2 a = uPath[i].xy;
      vec2 b = uPath[i + 1].xy;
      vec2 pa = p - a;
      vec2 ba = b - a;
      float span = max(dot(ba, ba), 1.0e-4);
      float h = clamp(dot(pa, ba) / span, 0.0, 1.0);
      float away = length(pa - ba * h);
      if (away < d) {
        d = away;
        along = mix(uPath[i].z, uPath[i + 1].z, h);
        side = sign(ba.x * pa.y - ba.y * pa.x);
        pace = sqrt(span) / max(abs(uPath[i].z - uPath[i + 1].z), 1.0e-5);
      }
    }
    float t = clamp((uFall - along) / max(uTail, 1.0e-4), 0.0, 1.0);
    float fade = 1.0 - t;

    float streakW = mix(1.7, 0.45, t);
    light += exp(-pow(d / streakW, 2.0)) * 2.4 * pow(fade, 1.25);

    float dustW = mix(3.5, 22.0, pow(t, 0.8));
    light += exp(-pow(d / dustW, 2.0)) * 0.5 * sqrt(3.5 / dustW) * pow(fade, 1.4);

    float cell = 0.0105;
    float id = floor(along / cell);
    for (int k = -1; k <= 1; k++) {
      float n = id + float(k);
      float at = (n + 0.5 + (hash(n) - 0.5) * 0.7) * cell;
      float behind = (uFall - at) / max(uTail, 1.0e-4);
      if (behind > 0.0 && behind < 1.0 && hash(n + 3.1) > 0.5) {
        float reach = mix(3.0, 17.0, pow(behind, 0.8));
        float across = (hash(n + 17.3) - 0.5) * 2.0 * reach;
        float ds = (along - at) * pace;
        float dn = d * side - across;
        float glimmer = 0.6 + 0.4 * sin(uTime * (5.0 + 6.0 * hash(n + 5.7)) + hash(n + 1.9) * 6.2832);
        light += exp(-(ds * ds + dn * dn) / 1.5) * (0.7 + 1.3 * hash(n + 9.7)) * pow(1.0 - behind, 1.4) * glimmer;
      }
    }

    vec2 q = p - uHead;
    float forward = dot(q, uDir);
    float across = dot(q, vec2(-uDir.y, uDir.x));
    float r = length(vec2(forward < 0.0 ? forward * 0.45 : forward, across));
    float pulse = 1.0 + 0.04 * sin(uTime * 5.2);
    light += (exp(-pow(r / 2.8, 2.0)) * 3.6 + exp(-pow(r / 9.0, 2.0)) * 1.0 + exp(-r / 22.0) * 0.3) * pulse;
    light *= uBody;
  }

  if (uFlash > 0.0) {
    vec2 f = p - uTarget;
    vec2 centre = uTarget + vec2(0.0, uRadius);
    float height = length(p - centre) - uRadius;
    float arc = uRadius * atan(p.x - centre.x, centre.y - p.y);
    float spread = mix(150.0, 46.0, uFlash);
    float near = exp(-pow(arc / spread, 2.0));
    float bloom = exp(-dot(f, f) / 1500.0) * 1.5 + exp(-length(f) / 20.0) * 0.8;
    float rim = exp(-pow(height / 2.6, 2.0)) * 1.6 + (height > 0.0 ? exp(-height / 16.0) * 0.5 : exp(height / 8.0) * 0.14);
    light += (bloom + rim * near) * uFlash;
  }

  float c = 1.0 - exp(-light);
  float alpha = clamp(c * 1.15, 0.0, 1.0);
  gl_FragColor = vec4(ramp(c) * alpha, alpha);
}
`;

const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function createComet(canvas: HTMLCanvasElement): Comet | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const built = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
  if (!built) return null;
  const { program } = built;
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uResolution = uniform("uResolution");
  const uPx = uniform("uPx");
  const uPath = uniform("uPath");
  const uHead = uniform("uHead");
  const uDir = uniform("uDir");
  const uFall = uniform("uFall");
  const uTail = uniform("uTail");
  const uBody = uniform("uBody");
  const uTarget = uniform("uTarget");
  const uRadius = uniform("uRadius");
  const uFlash = uniform("uFlash");
  const uTime = uniform("uTime");
  const path = new Float32Array(POINTS * 3);
  let width = 0;
  let height = 0;
  let ratio = 1;
  let painted = false;

  const wipe = () => {
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  };

  const clear = () => {
    if (!painted) return;
    wipe();
    painted = false;
  };

  return {
    resize() {
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uPx, ratio);
      wipe();
      painted = false;
    },
    clear,
    draw(fall, spent, flash, target, radius, time) {
      const body = fall > 0 && spent < 1 ? 1 - spent * spent : 0;
      if (body <= 0 && flash <= 0.004) {
        clear();
        return;
      }
      wipe();
      painted = true;

      const reach = Math.min(width * REACH, MAX_REACH);
      const start = { x: target.x - reach, y: START_Y };
      const bend = { x: mix(start.x, target.x, 0.55), y: mix(start.y, target.y, 0.3) };
      const at = (along: number) => {
        const rest = 1 - along;
        return {
          x: rest * rest * start.x + 2 * rest * along * bend.x + along * along * target.x,
          y: rest * rest * start.y + 2 * rest * along * bend.y + along * along * target.y,
        };
      };

      const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      const grow = (x: number, y: number, byX: number, byY: number) => {
        box.left = Math.min(box.left, x - byX);
        box.right = Math.max(box.right, x + byX);
        box.top = Math.min(box.top, y - byY);
        box.bottom = Math.max(box.bottom, y + byY);
      };

      if (body > 0) {
        const tail = Math.min(fall, TAIL) * (1 - spent);
        for (let index = 0; index < POINTS; index++) {
          const along = fall - (tail * index) / (POINTS - 1);
          const point = at(along);
          path[index * 3] = point.x;
          path[index * 3 + 1] = point.y;
          path[index * 3 + 2] = along;
          grow(point.x, point.y, MARGIN, MARGIN);
        }
        const head = at(fall);
        const before = at(fall - 0.01);
        const length = Math.hypot(head.x - before.x, head.y - before.y) || 1;
        gl.uniform3fv(uPath, path);
        gl.uniform2f(uHead, head.x, head.y);
        gl.uniform2f(uDir, (head.x - before.x) / length, (head.y - before.y) / length);
        gl.uniform1f(uFall, fall);
        gl.uniform1f(uTail, tail);
      }
      if (flash > 0.004) grow(target.x, target.y, BLOOM_REACH.x, BLOOM_REACH.y);
      gl.uniform1f(uBody, body);
      gl.uniform2f(uTarget, target.x, target.y);
      gl.uniform1f(uRadius, Math.max(1, radius));
      gl.uniform1f(uFlash, flash > 0.004 ? flash : 0);
      gl.uniform1f(uTime, time);

      const left = Math.max(0, Math.floor(box.left * ratio));
      const right = Math.min(canvas.width, Math.ceil(box.right * ratio));
      const top = Math.max(0, Math.floor(box.top * ratio));
      const bottom = Math.min(canvas.height, Math.ceil(box.bottom * ratio));
      if (right <= left || bottom <= top) return;
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(left, canvas.height - bottom, right - left, bottom - top);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}
