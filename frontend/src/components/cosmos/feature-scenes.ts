/**
 * The celestial scenes on the new landing page's feature cards, drawn on a 2D canvas as pure functions of a clock and
 * of where the pointer is on the card.
 *
 * Handles:
 * - phases (teaching mode): four moons wax from new to full one after another - each terminator drawn as a true
 *   sphere's ellipse, the dark side faintly lit by earthshine - and as each comes full, the idea its note explains
 *   appears under it; then all four wane together and it begins again;
 * - binary (fork): a single star, the project, swells and splits in two - the copy separating from it - and the pair
 *   settle into orbit round their shared centre of mass, the heavier original on the tighter orbit, each carrying its
 *   name;
 * - gauge (usage): the day's allowance as an orbit, a satellite carrying the used share round it while the arc behind
 *   it fills, the share counting up in the middle, and the week's bars rising one after another under it;
 * - escape (download): a capsule carrying the project's ZIP leaves a low orbit of its planet - its burn, then a
 *   steepening escape path off the card, its exhaust trailing - and the next one follows;
 * - moons (collaborate): three people orbit the project, each a moon with their initial, the owner on the innermost
 *   orbit and viewers furthest out, each moving at Kepler's pace for its distance (the inner ones faster), passing
 *   behind the planet and in front of it in depth order, each with its role riding beside it;
 * - planOrbits (pricing): three wide, flat orbits behind the plans, a small body on each at Kepler's pace, kept faint
 *   so the cards' text stands clear of them.
 * A pointer on the card (over, eased between 0 and 1 by the canvas) warms each scene a little - more light, brighter
 * orbits - rather than changing what it shows.
 */
import { EMBER, GOLD, ICE, MUTED, PEARL, clamp01, easeInOut, easeOut, field, glow, label, span } from "./draw";

export interface Pointer {
  x: number;
  y: number;
  over: number;
}

export type FeatureScene = (context: CanvasRenderingContext2D, width: number, height: number, time: number, pointer: Pointer) => void;

const loop = (time: number, period: number) => (time % period) / period;

function litDisc(context: CanvasRenderingContext2D, x: number, y: number, radius: number, lit: number, warmth: number) {
  context.fillStyle = "rgb(18, 16, 15)";
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(150, 160, 180, 0.06)";
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  if (lit <= 0.005) return;
  const phase = Math.PI * (1 - lit);
  const squeeze = Math.cos(phase);
  context.beginPath();
  context.arc(x, y, radius, -Math.PI / 2, Math.PI / 2, false);
  context.ellipse(x, y, Math.abs(squeeze) * radius, radius, 0, Math.PI / 2, -Math.PI / 2, squeeze < 0);
  context.closePath();
  const light = context.createRadialGradient(x + radius * 0.5, y - radius * 0.35, radius * 0.1, x, y, radius * 1.2);
  light.addColorStop(0, `rgba(${PEARL}, 1)`);
  light.addColorStop(0.55, `rgba(${GOLD}, ${0.85 + 0.15 * warmth})`);
  light.addColorStop(1, `rgba(${EMBER}, 0.55)`);
  context.fillStyle = light;
  context.fill();
}

const CONCEPTS = ["State", "Props", "Effects", "Routing"];

export const phases: FeatureScene = (context, width, height, time, pointer) => {
  field(context, width, height, time, 0.7);
  const t = loop(time, 9);
  const radius = Math.min(width * 0.07, height * 0.15);
  const gap = (width - radius * 2) / (CONCEPTS.length + 0.4);
  const wane = easeInOut(span(t, 0.86, 0.98));
  CONCEPTS.forEach((concept, index) => {
    const x = width / 2 + (index - (CONCEPTS.length - 1) / 2) * gap;
    const y = height * 0.44;
    const lit = easeInOut(span(t, 0.06 + index * 0.17, 0.2 + index * 0.17)) * (1 - wane);
    context.globalCompositeOperation = "lighter";
    glow(context, x, y, radius * 2.2, GOLD, (0.08 + 0.06 * pointer.over) * lit);
    context.globalCompositeOperation = "source-over";
    litDisc(context, x, y, radius, lit, pointer.over);
    label(context, concept, x, y + radius + 16, 0.9 * span(lit, 0.85, 1));
  });
};

export const binary: FeatureScene = (context, width, height, time, pointer) => {
  field(context, width, height, time, 0.7);
  const t = loop(time, 10);
  const fade = span(t, 0, 0.05) * (1 - span(t, 0.93, 1));
  const cx = width / 2;
  const cy = height * 0.46;
  const split = easeInOut(span(t, 0.2, 0.42));
  const reach = Math.min(width * 0.3, height * 0.62);
  const turn = (t - 0.2) * Math.PI * 2.4;
  const angle = Math.max(0, turn);
  const tilt = 0.42;
  const heavy = 0.41;
  const one = { x: cx - Math.cos(angle) * reach * heavy * split, y: cy - Math.sin(angle) * reach * heavy * split * tilt };
  const two = { x: cx + Math.cos(angle) * reach * (1 - heavy) * split, y: cy + Math.sin(angle) * reach * (1 - heavy) * split * tilt };

  if (split > 0.05) {
    context.strokeStyle = `rgba(${GOLD}, ${(0.12 + 0.1 * pointer.over) * split * fade})`;
    context.lineWidth = 1;
    for (const share of [heavy, 1 - heavy]) {
      context.beginPath();
      context.ellipse(cx, cy, reach * share * split, reach * share * split * tilt, 0, 0, Math.PI * 2);
      context.stroke();
    }
  }
  context.globalCompositeOperation = "lighter";
  const swell = 1 + 0.35 * Math.sin(span(t, 0.08, 0.22) * Math.PI);
  glow(context, one.x, one.y, 26 * swell, GOLD, 0.4 * fade);
  glow(context, one.x, one.y, 4 * swell, PEARL, fade);
  if (split > 0.02) {
    glow(context, two.x, two.y, 20, ICE, 0.32 * split * fade);
    glow(context, two.x, two.y, 3.2, PEARL, split * fade);
  }
  context.globalCompositeOperation = "source-over";
  label(context, "recipe-box", one.x, one.y + 20, 0.85 * fade, "center", true);
  label(context, "recipe-box-v2", two.x, two.y + 20, 0.85 * split * fade, "center", true);
};

const WEEK = [0.34, 0.58, 0.42, 0.8, 0.66, 0.48, 0.64];

export const gauge: FeatureScene = (context, width, height, time, pointer) => {
  field(context, width, height, time, 0.6);
  const t = loop(time, 8);
  const fade = span(t, 0, 0.04) * (1 - span(t, 0.94, 1));
  const cx = width / 2;
  const cy = height * 0.46;
  const radius = Math.min(width * 0.26, height * 0.34);
  const from = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const used = 0.64 * easeOut(span(t, 0.06, 0.55));

  context.lineCap = "round";
  context.strokeStyle = `rgba(${MUTED}, 0.14)`;
  context.lineWidth = 6;
  context.beginPath();
  context.arc(cx, cy, radius, from, from + sweep);
  context.stroke();
  for (let tick = 0; tick <= 4; tick++) {
    const a = from + (sweep * tick) / 4;
    context.strokeStyle = `rgba(${MUTED}, 0.25)`;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(cx + Math.cos(a) * (radius + 8), cy + Math.sin(a) * (radius + 8));
    context.lineTo(cx + Math.cos(a) * (radius + 12), cy + Math.sin(a) * (radius + 12));
    context.stroke();
  }
  if (used > 0.001) {
    const arc = context.createLinearGradient(cx - radius, cy, cx + radius, cy);
    arc.addColorStop(0, `rgba(${EMBER}, ${0.8 * fade})`);
    arc.addColorStop(1, `rgba(${GOLD}, ${fade})`);
    context.strokeStyle = arc;
    context.lineWidth = 6;
    context.beginPath();
    context.arc(cx, cy, radius, from, from + sweep * used);
    context.stroke();
    const end = from + sweep * used;
    context.globalCompositeOperation = "lighter";
    glow(context, cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, 14 + 6 * pointer.over, GOLD, 0.6 * fade);
    glow(context, cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, 3, PEARL, fade);
    context.globalCompositeOperation = "source-over";
  }
  context.globalAlpha = fade;
  context.fillStyle = `rgb(${PEARL})`;
  context.font = "600 22px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${Math.round(used * 100)}%`, cx, cy - 4);
  context.globalAlpha = 1;
  label(context, "of today's tokens", cx, cy + 16, 0.8 * fade);

  const barWidth = Math.min(10, width * 0.03);
  const row = barWidth * 2.1;
  const left = cx - (row * (WEEK.length - 1)) / 2;
  const base = height * 0.93;
  WEEK.forEach((value, index) => {
    const grow = easeOut(span(t, 0.12 + index * 0.06, 0.3 + index * 0.06));
    const top = base - value * height * 0.16 * grow;
    context.fillStyle = index === WEEK.length - 1 ? `rgba(${GOLD}, ${0.9 * fade})` : `rgba(${GOLD}, ${0.32 * fade})`;
    context.beginPath();
    context.roundRect(left + index * row - barWidth / 2, top, barWidth, base - top, 2);
    context.fill();
  });
};

export const escape: FeatureScene = (context, width, height, time, pointer) => {
  field(context, width, height, time, 0.7);
  const t = loop(time, 7);
  const px = width * 0.16;
  const py = height * 1.18;
  const radius = height * 0.62;
  const body = context.createRadialGradient(px + radius * 0.4, py - radius * 0.6, radius * 0.1, px, py, radius);
  body.addColorStop(0, "rgb(70, 50, 34)");
  body.addColorStop(0.6, "rgb(26, 20, 16)");
  body.addColorStop(1, "rgb(12, 10, 9)");
  context.fillStyle = body;
  context.beginPath();
  context.arc(px, py, radius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = `rgba(${GOLD}, ${0.45 + 0.2 * pointer.over})`;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(px, py, radius + 1, -Math.PI * 0.62, -Math.PI * 0.08);
  context.stroke();

  const start = { x: px + Math.cos(-Math.PI * 0.42) * (radius + 16), y: py + Math.sin(-Math.PI * 0.42) * (radius + 16) };
  const bend = { x: width * 0.78, y: height * 0.55 };
  const end = { x: width * 1.08, y: -height * 0.12 };
  const at = (s: number) => ({
    x: (1 - s) * (1 - s) * start.x + 2 * (1 - s) * s * bend.x + s * s * end.x,
    y: (1 - s) * (1 - s) * start.y + 2 * (1 - s) * s * bend.y + s * s * end.y,
  });

  context.save();
  context.setLineDash([2, 5]);
  context.strokeStyle = `rgba(${PEARL}, 0.22)`;
  context.beginPath();
  for (let step = 0; step <= 30; step++) {
    const point = at(step / 30);
    if (step === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();

  const fly = span(t, 0.18, 0.86);
  const s = fly * fly;
  const head = at(s);
  const behind = at(Math.max(0, s - 0.12 - 0.08 * fly));
  const burn = Math.max(0, 1 - Math.abs(t - 0.2) / 0.08);
  context.globalCompositeOperation = "lighter";
  if (fly > 0 && fly < 1) {
    const trail = context.createLinearGradient(head.x, head.y, behind.x, behind.y);
    trail.addColorStop(0, `rgba(${GOLD}, 0.8)`);
    trail.addColorStop(1, `rgba(${EMBER}, 0)`);
    context.strokeStyle = trail;
    context.lineWidth = 2;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(head.x, head.y);
    context.lineTo(behind.x, behind.y);
    context.stroke();
  }
  const capsule = fly <= 0 ? start : head;
  glow(context, capsule.x, capsule.y, 20, EMBER, 0.55 * burn);
  glow(context, capsule.x, capsule.y, 9, GOLD, 0.55);
  glow(context, capsule.x, capsule.y, 2.6, PEARL, 1);
  context.globalCompositeOperation = "source-over";
  label(context, "running-club.zip", capsule.x + 10, capsule.y + 14, 0.85 * (1 - span(fly, 0.75, 0.95)), "left", true);
};

const hueOf = (emails: string[]) =>
  emails.map((email) => {
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash) % 360;
  });

export function moonsScene(people: { name: string; email: string; role: string }[]): FeatureScene {
  const hues = hueOf(people.map((person) => person.email));
  return (context, width, height, time, pointer) => {
    field(context, width, height, time, 0.7);
    const cx = width / 2;
    const cy = height * 0.5;
    const tilt = 0.4;
    const span0 = Math.min(width * 0.46, height * 1.05);
    const orbits = [0.42, 0.7, 0.98].map((share) => span0 * share);
    orbits.forEach((radius) => {
      context.strokeStyle = `rgba(${GOLD}, ${0.13 + 0.1 * pointer.over})`;
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(cx, cy, radius, radius * tilt, 0, 0, Math.PI * 2);
      context.stroke();
    });
    const bodies = people.map((person, index) => {
      const radius = orbits[index];
      const speed = 0.5 * Math.pow(orbits[0] / radius, 1.5);
      const angle = index * 2.1 + time * speed;
      return { person, index, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * tilt, depth: Math.sin(angle) };
    });
    const drawPlanet = () => {
      context.globalCompositeOperation = "lighter";
      glow(context, cx, cy, 46, GOLD, 0.18 + 0.08 * pointer.over);
      context.globalCompositeOperation = "source-over";
      const planet = context.createRadialGradient(cx + 6, cy - 7, 2, cx, cy, 19);
      planet.addColorStop(0, "rgb(255, 232, 196)");
      planet.addColorStop(0.45, "rgb(214, 146, 70)");
      planet.addColorStop(1, "rgb(52, 32, 18)");
      context.fillStyle = planet;
      context.beginPath();
      context.arc(cx, cy, 18, 0, Math.PI * 2);
      context.fill();
    };
    const drawMoon = (body: (typeof bodies)[number]) => {
      const hidden = body.depth < 0 && Math.abs(body.x - cx) < 18 && Math.abs(body.y - cy) < 12;
      if (hidden) return;
      const size = 9 + 1.5 * body.depth;
      context.fillStyle = `hsl(${hues[body.index]}, 70%, ${50 + 6 * body.depth}%)`;
      context.beginPath();
      context.arc(body.x, body.y, size, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "rgba(255, 255, 255, 0.95)";
      context.font = "600 9.5px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(body.person.name.charAt(0), body.x, body.y + 0.5);
      label(context, body.person.role, body.x, body.y - size - 9, 0.55 + 0.35 * clamp01((body.depth + 1) / 2));
    };
    bodies.filter((body) => body.depth < 0).sort((a, b) => a.depth - b.depth).forEach(drawMoon);
    drawPlanet();
    bodies.filter((body) => body.depth >= 0).sort((a, b) => a.depth - b.depth).forEach(drawMoon);
  };
}

export const planOrbits: FeatureScene = (context, width, height, time) => {
  const cx = width / 2;
  const cy = height * 0.56;
  const shares = [0.2, 0.34, 0.48];
  context.globalCompositeOperation = "lighter";
  glow(context, cx, cy, Math.min(width, height) * 0.22, GOLD, 0.06);
  context.globalCompositeOperation = "source-over";
  shares.forEach((share, index) => {
    const rx = width * share;
    const ry = rx * 0.17;
    context.strokeStyle = `rgba(${GOLD}, ${0.1 + 0.03 * index})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    context.stroke();
    const angle = index * 2.2 + time * 0.12 * Math.pow(shares[0] / share, 1.5);
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    const front = Math.sin(angle) > 0;
    context.globalCompositeOperation = "lighter";
    glow(context, x, y, 12, index === 1 ? GOLD : ICE, front ? 0.35 : 0.15);
    glow(context, x, y, 2.4, PEARL, front ? 0.85 : 0.35);
    context.globalCompositeOperation = "source-over";
  });
};
