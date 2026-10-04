/**
 * The build orbit's ray, drawn by a fragment shader as the lit rim of a second planet: the orbit's path is that
 * planet's edge, and the light that HorizonArc's beam pours onto the top of it runs on round its circumference, the
 * same light as the beam and the planet rim above it.
 *
 * Handles: creating the WebGL program (returning null without WebGL, so the orbit can fall back), sizing the canvas
 * and the path to the orbit's layout, and drawing one frame: the planet's dark body inside the path, its rim lit
 * clockwise from the top of the path up to a given fraction of its length, with a brighter tip on the rim line leading
 * the light while it travels. Also exports the same path maths for the page: the path's length, the point at a fraction of it, and an
 * SVG path string of it.
 *
 * It used to be the hero's card-edge band laid along the path - a white-hot core with fbm flow, bright knots and
 * pulses racing along it, inside a wide violet glow, with a round comet flare at its head - which the owner said felt
 * like "a different one" from the beam pouring onto the orbit, then asked for it to look like it was going round
 * another planet. So it is now HorizonArc's own recipe, term for term: a crisp white rim line and a narrower glow on
 * it, a band of gold atmosphere outside the planet with a soft lower edge and a faint glow just inside, coloured
 * with the same ramp (glsl.ts) and the same tone curve and alpha, so the beam and this rim read as one light. The
 * leading edge simply dissolves: the rim line fades out over its last 200 design pixels and the atmosphere over a
 * longer stretch just behind it (airLit), so the front merges into the ray. A broad flare across the rim at the front
 * read as a smudge ("make it look professional"), and a brighter thin tip ending in a short fade read as a needle
 * sticking out of the ray. The head argument is kept for the caller but no longer drawn.
 * The atmosphere is ATMOSPHERE design pixels deep rather than HorizonArc's 200, in proportion to a much smaller planet.
 * The body is the dark disc the rim belongs to, a little darker than the sky and opaque enough to hide the stars behind
 * it, fading in as the steps fly out (the body argument).
 *
 * The path is a rounded rectangle given by its centre, the half-lengths of its straight edges and its corner radius,
 * walked clockwise from the middle of its top edge; a circle is the case with no straight edges, so one shader serves
 * a ring and a frame alike. Each pixel near the path is re-expressed as a distance along it and a distance out from
 * it. Those distances are in the beam's design pixels - the canvas's pixels per CSS pixel, divided by the orbit's CSS
 * zoom and times HorizonArc's own shrink below its design width (resize's zoom and design arguments) - so the rim and
 * its flare come out on screen at the same width as the beam. It renders at one device pixel per CSS pixel at most,
 * times the given density, so a zoomed orbit stays sharp. The lit stretch fades in over its first few pixels at the
 * top, where the distance along the path wraps from its end back to 0, rather than starting in a straight cut, and
 * the fade is blended away as the rim closes into a full circle.
 *
 * The colours are a ramp handed in when the ray is made: the first landing page's orbit takes the one its beam is
 * painted with, and the home page's takes the gold one its comet is painted with (glsl.ts), so in each the rim is the
 * colour of the light that lit it. How far the light takes to come up from nothing at the top of the path is
 * handed in too (in design pixels): the rim line over 40 at most, the atmosphere over the whole of it. The first
 * page's 40 was hidden under its beam; on the home page, where a comet lands there and is gone, the atmosphere
 * starting within 40 showed as a straight cut standing on the rim, so it is given a longer rise.
 */
import { FULLSCREEN_VERTEX, RAMP_GLSL, createProgram } from "./glsl";

const QUARTER = Math.PI / 2;

export type Shape = { cx: number; cy: number; ex: number; ey: number; c: number };

const fragment = (ramp: string) => `
precision highp float;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform vec3 uShape;
uniform float uPx;
uniform float uProgress;
uniform float uHead;
uniform float uBody;
uniform float uTime;
uniform float uStart;
${ramp}

const float ATMOSPHERE = 70.0;

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float ex = uShape.x, ey = uShape.y, c = uShape.z;
  vec2 q = abs(p) - vec2(ex, ey);
  float n = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - c) / uPx;
  float light = 0.0;

  if (uProgress > 0.0 && n > -120.0 && n < 3.0 * ATMOSPHERE) {
    float lc = 1.5707963 * c;
    float total = 4.0 * ex + 4.0 * ey + 4.0 * lc;
    float s;
    if (q.x > 0.0 && q.y > 0.0) {
      float a = atan(q.y, q.x);
      if (p.x >= 0.0 && p.y >= 0.0) s = ex + (1.5707963 - a) * c;
      else if (p.x >= 0.0) s = ex + lc + 2.0 * ey + a * c;
      else if (p.y < 0.0) s = 3.0 * ex + 2.0 * lc + 2.0 * ey + (1.5707963 - a) * c;
      else s = 3.0 * ex + 3.0 * lc + 4.0 * ey + a * c;
    } else if (q.x >= q.y) {
      s = p.x >= 0.0 ? ex + lc + (ey - p.y) : 3.0 * ex + 3.0 * lc + 2.0 * ey + (p.y + ey);
    } else {
      s = p.y >= 0.0 ? (p.x >= 0.0 ? p.x : total + p.x) : ex + 2.0 * lc + 2.0 * ey + (ex - p.x);
    }
    float span = total / uPx;
    float along = s / uPx;
    float front = uProgress * span;
    float full = smoothstep(0.97, 1.0, uProgress);
    float start = mix(smoothstep(0.0, min(40.0, uStart), along), 1.0, full);
    float rise = mix(smoothstep(0.0, uStart, along), 1.0, full);
    float lineLit = uProgress >= 1.0 ? 1.0 : (1.0 - smoothstep(front - 200.0, front, along)) * start;
    float airLit = uProgress >= 1.0 ? 1.0 : (1.0 - smoothstep(front - 320.0, front - 20.0, along)) * rise;
    float breath = 1.0 + 0.04 * sin(uTime * 0.8);

    light += (exp(-pow(n / 1.6, 2.0)) * 2.4 + exp(-pow(n / 6.0, 2.0)) * 0.7) * lineLit;
    if (n < 0.0) {
      light += exp(n / 14.0) * 0.16 * airLit;
    } else {
      light += (exp(-pow(n / ATMOSPHERE, 2.2)) * 0.6 + exp(-n / 22.0) * 0.4) * breath * airLit;
    }

  }

  float cl = 1.0 - exp(-light);
  float alpha = clamp(cl * 1.15, 0.0, 1.0);
  float body = uBody * 0.88 * (1.0 - smoothstep(-1.5, 1.5, n));
  vec3 col = ramp(cl) * alpha + vec3(0.012, 0.008, 0.004) * body * (1.0 - alpha);
  gl_FragColor = vec4(col, alpha + body * (1.0 - alpha));
}
`;

export function shapeLength({ ex, ey, c }: Shape) {
  return 4 * ex + 4 * ey + 2 * Math.PI * c;
}

export function shapePoint(shape: Shape, fraction: number) {
  const { cx, cy, ex, ey, c } = shape;
  const lc = QUARTER * c;
  let s = (((fraction % 1) + 1) % 1) * shapeLength(shape);
  const corner = (x: number, y: number, from: number) => (length: number) => {
    const angle = from + (c > 0 ? length / c : 0);
    return { x: x + c * Math.sin(angle), y: y - c * Math.cos(angle) };
  };
  const segments: [number, (length: number) => { x: number; y: number }][] = [
    [ex, (l) => ({ x: cx + l, y: cy - ey - c })],
    [lc, corner(cx + ex, cy - ey, 0)],
    [2 * ey, (l) => ({ x: cx + ex + c, y: cy - ey + l })],
    [lc, corner(cx + ex, cy + ey, QUARTER)],
    [2 * ex, (l) => ({ x: cx + ex - l, y: cy + ey + c })],
    [lc, corner(cx - ex, cy + ey, 2 * QUARTER)],
    [2 * ey, (l) => ({ x: cx - ex - c, y: cy + ey - l })],
    [lc, corner(cx - ex, cy - ey, 3 * QUARTER)],
    [ex, (l) => ({ x: cx - ex + l, y: cy - ey - c })],
  ];
  for (const [length, at] of segments) {
    if (s <= length) return at(s);
    s -= length;
  }
  return { x: cx, y: cy - ey - c };
}

export function shapePath(shape: Shape) {
  const { cx, cy, ex, ey, c } = shape;
  const top = cy - ey - c;
  if (ex === 0 && ey === 0) return `M ${cx} ${top} A ${c} ${c} 0 1 1 ${cx} ${cy + c} A ${c} ${c} 0 1 1 ${cx} ${top}`;
  return [
    `M ${cx} ${top}`,
    `H ${cx + ex}`,
    `A ${c} ${c} 0 0 1 ${cx + ex + c} ${cy - ey}`,
    `V ${cy + ey}`,
    `A ${c} ${c} 0 0 1 ${cx + ex} ${cy + ey + c}`,
    `H ${cx - ex}`,
    `A ${c} ${c} 0 0 1 ${cx - ex - c} ${cy + ey}`,
    `V ${cy - ey}`,
    `A ${c} ${c} 0 0 1 ${cx - ex} ${top}`,
    "Z",
  ].join(" ");
}

export type OrbitRay = {
  resize: (width: number, height: number, shape: Shape, density: number, zoom: number, design: number) => void;
  draw: (progress: number, head: number, body: number, time: number) => void;
  dispose: () => void;
};

export function createOrbitRay(canvas: HTMLCanvasElement, ramp = RAMP_GLSL, start = 40): OrbitRay | null {
  const gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const built = createProgram(gl, FULLSCREEN_VERTEX, fragment(ramp));
  if (!built) return null;
  const { program, dispose } = built;
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uResolution = uniform("uResolution");
  const uCenter = uniform("uCenter");
  const uShape = uniform("uShape");
  const uPx = uniform("uPx");
  const uProgress = uniform("uProgress");
  const uHead = uniform("uHead");
  const uBody = uniform("uBody");
  const uTime = uniform("uTime");
  gl.uniform1f(uniform("uStart"), start);

  return {
    resize(width, height, shape, density, zoom, design) {
      const scale = Math.min(window.devicePixelRatio || 1, 1) * density;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform2f(uCenter, shape.cx * scale, canvas.height - shape.cy * scale);
      gl.uniform3f(uShape, shape.ex * scale, shape.ey * scale, shape.c * scale);
      gl.uniform1f(uPx, (scale / zoom) * design);
    },
    draw(progress, head, body, time) {
      gl.uniform1f(uProgress, progress);
      gl.uniform1f(uHead, head);
      gl.uniform1f(uBody, body);
      gl.uniform1f(uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    dispose,
  };
}
