/**
 * The orrery that shows where a project's code runs: a small star system whose bodies are the parts the app is built
 * from, drawn on a 2D canvas as a function of how far the visitor has scrolled through it and of a clock.
 *
 * Handles: the system's centre (an eclipse - the app's own mark) and four bodies on tilted orbits, each a small sphere
 * lit from the centre and carrying its name - your browser, the AI, your files, and the preview pod, the last inside
 * the dashed bounds of its sandbox - moving round at Kepler's pace for their distance, slowly enough to read; and
 * along the scroll (FLOWS) four comets crossing between them on curved transfer arcs - your prompt to the AI, the
 * files it writes (three of them, one after another) to storage, the files synced into the pod, and the live preview
 * back to the browser - each lighting the body it arrives at, while the pod glows once code is running in it and only
 * there; and, as the section leaves the screen upwards (stretch), the orbits widening and flattening and fading, so
 * they hand on towards the three orbits behind the plans below.
 *
 * Bodies are drawn back to front by depth, so a body passing behind the centre is hidden by it. FLOWS and BODIES are
 * exported for the section's text, which names the same four moves in the same order.
 */
import { EMBER, GOLD, ICE, PEARL, clamp01, easeInOut, field, glow, label, span } from "./draw";

export interface Body {
  name: string;
  note: string;
  orbit: number;
  angle: number;
  size: number;
  tint: string;
}

export const BODIES: Body[] = [
  { name: "Your browser", note: "where you chat and watch", orbit: 0.3, angle: 2.75, size: 7, tint: ICE },
  { name: "The AI", note: "writes files, runs nothing", orbit: 0.52, angle: 5.2, size: 8, tint: GOLD },
  { name: "Your files", note: "kept in object storage", orbit: 0.74, angle: 0.55, size: 7, tint: PEARL },
  { name: "Preview pod", note: "the only place code runs", orbit: 0.96, angle: 1.95, size: 9, tint: EMBER },
];

export const FLOWS = [
  { from: 0, to: 1, at: 0.08, until: 0.26, what: "your prompt", count: 1 },
  { from: 1, to: 2, at: 0.3, until: 0.52, what: "files", count: 3 },
  { from: 2, to: 3, at: 0.56, until: 0.72, what: "sync", count: 1 },
  { from: 3, to: 0, at: 0.76, until: 0.94, what: "live preview", count: 1 },
];

const TILT = 0.36;
const PACE = 0.05;
const FILE_LAG = 0.045;

export function drawOrrery(context: CanvasRenderingContext2D, width: number, height: number, progress: number, time: number, stretch: number) {
  field(context, width, height, time, 0.8);
  const cx = width / 2;
  const cy = height * 0.5;
  const reach = Math.min(width * 0.47, (height * 0.46) / TILT);
  const widen = 1 + 0.55 * stretch;
  const tilt = TILT * (1 - 0.55 * stretch);
  const fade = 1 - stretch;

  BODIES.forEach((body) => {
    const radius = reach * body.orbit * widen;
    context.strokeStyle = `rgba(${GOLD}, ${0.16 * fade + 0.05})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(cx, cy, radius, radius * tilt, 0, 0, Math.PI * 2);
    context.stroke();
  });

  const place = (index: number) => {
    const body = BODIES[index];
    const radius = reach * body.orbit * widen;
    const angle = body.angle + time * PACE * Math.pow(BODIES[0].orbit / body.orbit, 1.5);
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * tilt, depth: Math.sin(angle) };
  };
  const spots = BODIES.map((_, index) => place(index));
  const running = span(progress, FLOWS[2].until - 0.02, FLOWS[2].until + 0.06);
  const arrivals = BODIES.map((_, index) =>
    FLOWS.reduce((most, flow) => (flow.to === index ? Math.max(most, 1 - Math.abs(progress - flow.until) / 0.05) : most), 0)
  );

  const drawCentre = () => {
    context.globalCompositeOperation = "lighter";
    glow(context, cx, cy, 54, GOLD, 0.2 * fade + 0.05);
    glow(context, cx, cy, 22, PEARL, 0.35 * fade + 0.1);
    context.globalCompositeOperation = "source-over";
    context.fillStyle = "rgb(10, 9, 8)";
    context.beginPath();
    context.arc(cx, cy, 11, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = `rgba(${PEARL}, ${0.85 * fade + 0.1})`;
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(cx, cy, 11.5, 0, Math.PI * 2);
    context.stroke();
  };

  const drawBody = (index: number) => {
    const body = BODIES[index];
    const { x, y, depth } = spots[index];
    if (depth < 0 && Math.abs(x - cx) < 16 && Math.abs(y - cy) < 14) return;
    const size = body.size * (1 + 0.12 * depth);
    if (index === 3) {
      context.save();
      context.setLineDash([3, 4]);
      context.lineDashOffset = -time * 6;
      context.strokeStyle = `rgba(${ICE}, ${(0.3 + 0.35 * running) * fade})`;
      context.lineWidth = 1;
      context.beginPath();
      context.arc(x, y, size + 16, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      context.globalCompositeOperation = "lighter";
      glow(context, x, y, size + 22, EMBER, 0.32 * running * fade);
      context.globalCompositeOperation = "source-over";
    }
    context.globalCompositeOperation = "lighter";
    glow(context, x, y, size * 3.2, body.tint, (0.12 + 0.5 * arrivals[index]) * fade);
    context.globalCompositeOperation = "source-over";
    const lightX = x + ((cx - x) / Math.max(1, Math.hypot(cx - x, cy - y))) * size * 0.55;
    const lightY = y + ((cy - y) / Math.max(1, Math.hypot(cx - x, cy - y))) * size * 0.55;
    const sphere = context.createRadialGradient(lightX, lightY, size * 0.1, x, y, size);
    sphere.addColorStop(0, `rgba(${PEARL}, ${fade})`);
    sphere.addColorStop(0.45, `rgba(${body.tint}, ${0.9 * fade})`);
    sphere.addColorStop(1, `rgba(20, 16, 14, ${fade})`);
    context.fillStyle = sphere;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
    const below = y > cy;
    context.globalAlpha = fade;
    context.fillStyle = `rgb(${PEARL})`;
    context.font = "600 12px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const nameY = below ? y + size + 20 : y - size - 30;
    context.fillText(body.name, x, nameY);
    context.globalAlpha = 1;
    label(context, body.note, x, nameY + 15, 0.85 * fade);
  };

  const order = spots.map((spot, index) => ({ index, depth: spot.depth })).sort((a, b) => a.depth - b.depth);
  order.filter((item) => item.depth < 0).forEach((item) => drawBody(item.index));
  drawCentre();
  order.filter((item) => item.depth >= 0).forEach((item) => drawBody(item.index));

  FLOWS.forEach((flow) => {
    for (let copy = 0; copy < flow.count; copy++) {
      const start = flow.at + copy * FILE_LAG;
      const travel = easeInOut(span(progress, start, start + (flow.until - flow.at) - (flow.count - 1) * FILE_LAG));
      if (travel <= 0 || travel >= 1) continue;
      const a = spots[flow.from];
      const b = spots[flow.to];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const away = { x: mid.x - cx, y: mid.y - cy };
      const length = Math.max(1, Math.hypot(away.x, away.y));
      const bow = Math.hypot(b.x - a.x, b.y - a.y) * 0.32;
      const bend = { x: mid.x + (away.x / length) * bow, y: mid.y + (away.y / length) * bow };
      const at = (s: number) => ({
        x: (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * bend.x + s * s * b.x,
        y: (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * bend.y + s * s * b.y,
      });
      context.save();
      context.setLineDash([2, 5]);
      context.strokeStyle = `rgba(${PEARL}, ${0.16 * fade})`;
      context.beginPath();
      for (let step = 0; step <= 24; step++) {
        const point = at(step / 24);
        if (step === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      }
      context.stroke();
      context.restore();
      const head = at(travel);
      context.globalCompositeOperation = "lighter";
      context.lineCap = "round";
      for (let segment = 1; segment <= 10; segment++) {
        const from = at(Math.max(0, travel - (segment - 1) * 0.022));
        const to = at(Math.max(0, travel - segment * 0.022));
        context.strokeStyle = `rgba(${GOLD}, ${0.7 * (1 - segment / 10) * fade})`;
        context.lineWidth = 2 - segment * 0.12;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
      }
      glow(context, head.x, head.y, 10, GOLD, 0.6 * fade);
      glow(context, head.x, head.y, 2.6, PEARL, fade);
      context.globalCompositeOperation = "source-over";
      if (copy === 0) label(context, flow.what, head.x, head.y - 14, 0.9 * fade * clamp01(Math.min(travel, 1 - travel) * 8), "center", true);
    }
  });
}

export function orreryStep(progress: number) {
  let current = -1;
  FLOWS.forEach((flow, index) => {
    if (progress >= flow.at - 0.02) current = index;
  });
  return current;
}
