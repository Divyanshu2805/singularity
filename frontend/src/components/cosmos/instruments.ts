/**
 * The small celestial instruments that act out each step of how the app works, drawn on a 2D canvas as pure
 * functions of how far through its step the page is (0 to 1) plus a clock for the things that keep living.
 *
 * Handles: one drawing per step, each timed against what the app's own screen is doing in that step (BuildScenes'
 * cues), so the instrument and the window tell the same moment:
 * - ignition (describe): a cloud of dust falls inwards under its own gravity as the idea is typed - each mote
 *   accelerating as a free fall does, thinning as it arrives - and the protostar at its heart brightens, putting out
 *   four diffraction spikes once the idea is sent;
 * - constellation (interview): a star for each answer appears as it is picked, the figure's lines drawing from one to
 *   the next, each star labelled with the answer it stands for, and the whole figure warming when the brief is made;
 * - meteors (build): each file the AI writes falls as a meteor - a hot head, a thinning gold trail, its name riding
 *   behind - onto the limb of a small world, where it leaves a light that stays, so the project's files gather as a
 *   town's lights do;
 * - daybreak (live): a planet inside the dashed bounds of its own pod turns from night - its cities lit - into day as
 *   the preview boots, the terminator sweeping across on a true sphere's ellipse and the atmosphere catching the light
 *   along the lit limb;
 * - transfer (change): a moon circles its planet; when the change is sent it burns, coasts up a half-ellipse while the
 *   files are edited, and burns again to settle on its new orbit as the preview reloads - a Hohmann transfer, the way a
 *   craft really changes orbit.
 * Each also lays a few faint fixed stars behind itself. Positions are seeded, so a frame is the same for the same
 * progress and time; nothing is allocated per frame beyond the few gradients a frame draws.
 */
import { EMBER, GOLD, ICE, MUTED, PEARL, clamp01, easeInOut, easeOut, field, glow, label, seeded, span, spikes } from "./draw";

export type Instrument = (context: CanvasRenderingContext2D, width: number, height: number, progress: number, time: number) => void;

const DUST = (() => {
  const random = seeded(90210);
  return Array.from({ length: 90 }, () => {
    const angle = random() * Math.PI * 2;
    return { angle, reach: 0.35 + random() * 0.65, delay: random() * 0.28, size: 0.5 + random() * 0.9, tint: random() < 0.7 ? GOLD : PEARL, wobble: random() * 6.28 };
  });
})();

const ignition: Instrument = (context, width, height, progress, time) => {
  field(context, width, height, time, 0.8);
  const cx = width * 0.5;
  const cy = height * 0.52;
  const room = Math.min(width * 0.42, height * 1.1);
  context.globalCompositeOperation = "lighter";
  const fall = span(progress, 0.08, 0.8);
  for (const mote of DUST) {
    const tau = clamp01((fall - mote.delay) / (1 - mote.delay));
    const left = Math.pow(1 - tau, 2 / 3);
    if (left <= 0.02) continue;
    const r = mote.reach * room * left;
    const sway = 0.05 * Math.sin(time * 0.6 + mote.wobble) * left;
    const x = cx + Math.cos(mote.angle + sway) * r;
    const y = cy + Math.sin(mote.angle + sway) * r * 0.62;
    context.globalAlpha = (0.25 + 0.45 * (1 - left)) * Math.min(1, left * 4);
    context.fillStyle = `rgb(${mote.tint})`;
    context.beginPath();
    context.arc(x, y, mote.size, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  const heat = easeOut(span(progress, 0.12, 0.78));
  const lit = easeOut(span(progress, 0.74, 0.92));
  glow(context, cx, cy, 10 + 34 * heat + 18 * lit, EMBER, 0.12 + 0.2 * heat);
  glow(context, cx, cy, 6 + 16 * heat + 10 * lit, GOLD, 0.25 + 0.5 * heat);
  glow(context, cx, cy, 2 + 5 * heat + 4 * lit, PEARL, 0.4 + 0.6 * heat);
  spikes(context, cx, cy, 10 + 40 * lit, 0.75 * lit * (0.9 + 0.1 * Math.sin(time * 2.1)));
  context.globalCompositeOperation = "source-over";
};

const FIGURE = [
  { x: 0.13, y: 0.66, at: 0.18, text: "My running club" },
  { x: 0.36, y: 0.3, at: 0.38, text: "Log a run" },
  { x: 0.62, y: 0.56, at: 0.62, text: "3 screens" },
  { x: 0.86, y: 0.26, at: 0.78, text: "Warm, minimal" },
];

const constellation: Instrument = (context, width, height, progress, time) => {
  field(context, width, height, time);
  const made = easeOut(span(progress, 0.83, 0.97));
  const points = FIGURE.map((star) => ({ ...star, px: star.x * width, py: star.y * height }));
  context.lineCap = "round";
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const drawn = easeInOut(span(progress, to.at - 0.04, to.at + 0.07));
    if (drawn <= 0) continue;
    context.strokeStyle = `rgba(${GOLD}, ${0.38 + 0.3 * made})`;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(from.px, from.py);
    context.lineTo(from.px + (to.px - from.px) * drawn, from.py + (to.py - from.py) * drawn);
    context.stroke();
  }
  context.globalCompositeOperation = "lighter";
  points.forEach((star, index) => {
    const shown = easeOut(span(progress, star.at - 0.06, star.at + 0.02));
    if (shown <= 0) return;
    const flare = Math.max(0, 1 - Math.abs(progress - star.at) / 0.06);
    const twinkle = 0.85 + 0.15 * Math.sin(time * 1.7 + index * 1.9);
    glow(context, star.px, star.py, 9 + 9 * made + 10 * flare, GOLD, (0.35 + 0.25 * made) * shown);
    glow(context, star.px, star.py, 2.6 + 1.4 * made, PEARL, 0.95 * shown * twinkle);
    spikes(context, star.px, star.py, 6 + 14 * flare + 6 * made, 0.5 * shown * Math.max(flare, made));
  });
  context.globalCompositeOperation = "source-over";
  points.forEach((star) => {
    const shown = easeOut(span(progress, star.at - 0.02, star.at + 0.08));
    label(context, star.text, star.px, star.py + (star.y > 0.5 ? 17 : -15), 0.9 * shown);
  });
};

const FILES = [
  { name: "package.json", at: 0.17 },
  { name: "streaks.ts", at: 0.27 },
  { name: "StreakCalendar.tsx", at: 0.57 },
  { name: "Leaderboard.tsx", at: 0.69 },
  { name: "Dashboard.tsx", at: 0.8 },
];
const FALL = 0.13;

const meteors: Instrument = (context, width, height, progress, time) => {
  field(context, width, height, time);
  const groundY = (x: number) => height * 0.8 + Math.pow((x - width * 0.5) / width, 2) * height * 0.55;
  const ground = context.createLinearGradient(0, height * 0.76, 0, height);
  ground.addColorStop(0, "rgba(16, 13, 11, 1)");
  ground.addColorStop(1, "rgba(7, 6, 5, 1)");
  context.fillStyle = ground;
  context.beginPath();
  context.moveTo(0, groundY(0));
  for (let x = 8; x <= width + 8; x += 8) context.lineTo(x, groundY(x));
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.fill();

  const landed = FILES.filter((file) => progress >= file.at).length;
  const air = context.createLinearGradient(0, 0, width, 0);
  air.addColorStop(0, `rgba(${ICE}, 0.08)`);
  air.addColorStop(0.5, `rgba(${GOLD}, ${0.32 + 0.1 * landed})`);
  air.addColorStop(1, `rgba(${ICE}, 0.08)`);
  context.strokeStyle = air;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, groundY(0));
  for (let x = 8; x <= width + 8; x += 8) context.lineTo(x, groundY(x));
  context.stroke();

  context.globalCompositeOperation = "lighter";
  FILES.forEach((file, index) => {
    const landX = width * (0.22 + index * 0.14);
    const landY = groundY(landX) + 3;
    const startX = landX - width * 0.28;
    const startY = -6;
    const flight = span(progress, file.at - FALL, file.at);
    if (progress >= file.at) {
      const age = span(progress, file.at, file.at + 0.08);
      glow(context, landX, landY, 22 * (1 - age) + 7, GOLD, 0.55 * (1 - age) + 0.2);
      glow(context, landX, landY, 2.4, PEARL, 0.9 * (0.85 + 0.15 * Math.sin(time * 2 + index)));
      return;
    }
    if (flight <= 0) return;
    const travel = flight * flight;
    const hx = startX + (landX - startX) * travel;
    const hy = startY + (landY - startY) * travel;
    const dx = landX - startX;
    const dy = landY - startY;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const tail = 22 + 46 * flight;
    const trail = context.createLinearGradient(hx, hy, hx - ux * tail, hy - uy * tail);
    trail.addColorStop(0, `rgba(${PEARL}, 0.95)`);
    trail.addColorStop(0.25, `rgba(${GOLD}, 0.55)`);
    trail.addColorStop(1, `rgba(${EMBER}, 0)`);
    context.strokeStyle = trail;
    context.lineWidth = 1.4;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(hx, hy);
    context.lineTo(hx - ux * tail, hy - uy * tail);
    context.stroke();
    glow(context, hx, hy, 8, GOLD, 0.6);
    glow(context, hx, hy, 2, PEARL, 1);
    context.globalCompositeOperation = "source-over";
    const right = hx > width * 0.55;
    label(context, file.name, right ? hx - 9 : hx + 9, Math.max(9, hy - 9), 0.9 * Math.min(1, flight * 4), right ? "right" : "left", true);
    context.globalCompositeOperation = "lighter";
  });
  context.globalCompositeOperation = "source-over";
};

const CITIES = (() => {
  const random = seeded(31337);
  return Array.from({ length: 46 }, () => {
    const r = Math.sqrt(random()) * 0.92;
    const angle = random() * Math.PI * 2;
    return { x: Math.cos(angle) * r, y: Math.sin(angle) * r, bright: 0.3 + random() * 0.7 };
  });
})();

const daybreak: Instrument = (context, width, height, progress, time) => {
  field(context, width, height, time);
  const cx = width * 0.6;
  const cy = height * 0.54;
  const radius = Math.min(height * 0.36, width * 0.22);
  const day = easeInOut(span(progress, 0.1, 0.6));
  const phase = Math.PI * (1 - 0.78 * day);
  const squeeze = Math.cos(phase);

  context.save();
  context.setLineDash([3, 5]);
  context.strokeStyle = `rgba(${ICE}, ${0.22 + 0.1 * Math.sin(time * 0.8)})`;
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(cx, cy, radius * 1.55, radius * 1.55, 0, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  label(context, "pod", cx + radius * 1.1, cy - radius * 1.3, 0.75, "left", true);

  context.fillStyle = "rgb(11, 10, 9)";
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.clip();
  context.globalCompositeOperation = "lighter";
  for (const city of CITIES) {
    const x = city.x * radius;
    const terminator = -squeeze * Math.sqrt(Math.max(0, radius * radius - (city.y * radius) ** 2));
    const night = x < terminator - 3 ? 1 : 0;
    if (!night) continue;
    context.globalAlpha = 0.55 * city.bright * (0.85 + 0.15 * Math.sin(time * 3 + city.bright * 9));
    context.fillStyle = `rgb(${GOLD})`;
    context.beginPath();
    context.arc(cx + x, cy + city.y * radius, 0.7 + city.bright * 0.6, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  if (day > 0.01) {
    context.beginPath();
    context.arc(cx, cy, radius, -Math.PI / 2, Math.PI / 2, false);
    context.ellipse(cx, cy, Math.abs(squeeze) * radius, radius, 0, Math.PI / 2, -Math.PI / 2, squeeze < 0);
    context.closePath();
    const sunlight = context.createRadialGradient(cx + radius * 0.75, cy - radius * 0.2, radius * 0.1, cx + radius * 0.3, cy, radius * 1.4);
    sunlight.addColorStop(0, `rgba(${PEARL}, ${0.85 * day})`);
    sunlight.addColorStop(0.45, `rgba(${GOLD}, ${0.55 * day})`);
    sunlight.addColorStop(1, `rgba(${EMBER}, ${0.12 * day})`);
    context.fillStyle = sunlight;
    context.fill();
  }
  context.restore();

  context.globalCompositeOperation = "lighter";
  context.lineWidth = 2;
  context.strokeStyle = `rgba(${ICE}, ${0.5 * day})`;
  context.beginPath();
  context.arc(cx, cy, radius + 1, -Math.PI / 2, Math.PI / 2);
  context.stroke();
  glow(context, cx + radius * 1.05, cy, radius * 0.9, ICE, 0.12 * day);
  context.globalCompositeOperation = "source-over";

  const boots = ["install", "start", "connect", "live"];
  boots.forEach((name, index) => {
    const at = 0.21 + index * 0.105;
    const done = progress >= at;
    const y = height * 0.24 + index * height * 0.17;
    context.fillStyle = done ? `rgba(${GOLD}, 0.95)` : `rgba(${MUTED}, 0.25)`;
    context.beginPath();
    context.arc(width * 0.08, y, 2.6, 0, Math.PI * 2);
    context.fill();
    label(context, name, width * 0.08 + 9, y, done ? 0.9 : 0.4, "left", true);
  });
};

const transfer: Instrument = (context, width, height, progress, time) => {
  field(context, width, height, time);
  const cx = width * 0.5;
  const cy = height * 0.55;
  const tilt = 0.38;
  const inner = Math.min(width * 0.16, height * 0.62);
  const outer = Math.min(width * 0.36, height * 1.3);
  const burn = 0.22;
  const arrive = 0.69;
  const coast = span(progress, burn, arrive);
  const settled = progress >= arrive;

  const orbit = (radius: number, alpha: number, dash: number[] = []) => {
    if (alpha <= 0.01) return;
    context.save();
    context.setLineDash(dash);
    context.strokeStyle = `rgba(${GOLD}, ${alpha})`;
    context.lineWidth = 1;
    context.beginPath();
    context.ellipse(cx, cy, radius, radius * tilt, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  };
  orbit(inner, 0.4 * (1 - 0.7 * span(progress, arrive, arrive + 0.15)));
  orbit(outer, 0.12 + 0.3 * easeOut(span(progress, arrive - 0.05, arrive + 0.1)), settled ? [] : [3, 5]);

  const a = (inner + outer) / 2;
  const c = (outer - inner) / 2;
  const b = Math.sqrt(Math.max(0, a * a - c * c));
  const start = Math.PI * 0.2;
  if (coast > 0 && !settled) {
    context.save();
    context.setLineDash([2, 4]);
    context.strokeStyle = `rgba(${PEARL}, 0.45)`;
    context.beginPath();
    for (let step = 0; step <= 40; step++) {
      const e = Math.PI * (step / 40) * coast;
      const ex = -c + a * Math.cos(e);
      const ey = b * Math.sin(e);
      const rot = start;
      const x = cx + (ex * Math.cos(rot) - ey * Math.sin(rot));
      const y = cy + (ex * Math.sin(rot) + ey * Math.cos(rot)) * tilt;
      if (step === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.restore();
  }

  context.globalCompositeOperation = "lighter";
  glow(context, cx, cy, 30, GOLD, 0.16);
  context.globalCompositeOperation = "source-over";
  const planet = context.createRadialGradient(cx + 4, cy - 4, 1, cx, cy, 12);
  planet.addColorStop(0, "rgb(255, 230, 190)");
  planet.addColorStop(0.5, "rgb(196, 128, 62)");
  planet.addColorStop(1, "rgb(46, 30, 18)");
  context.fillStyle = planet;
  context.beginPath();
  context.arc(cx, cy, 11, 0, Math.PI * 2);
  context.fill();

  let x: number;
  let y: number;
  if (progress < burn) {
    const angle = start - (burn - progress) * 9;
    x = cx + Math.cos(angle) * inner;
    y = cy + Math.sin(angle) * inner * tilt;
  } else if (!settled) {
    const e = Math.PI * easeInOut(coast);
    const ex = -c + a * Math.cos(e);
    const ey = b * Math.sin(e);
    x = cx + (ex * Math.cos(start) - ey * Math.sin(start));
    y = cy + (ex * Math.sin(start) + ey * Math.cos(start)) * tilt;
  } else {
    const angle = start + Math.PI + (progress - arrive) * 4 + time * 0.12;
    x = cx + Math.cos(angle) * outer;
    y = cy + Math.sin(angle) * outer * tilt;
  }
  context.globalCompositeOperation = "lighter";
  for (const at of [burn, arrive]) {
    const flare = Math.max(0, 1 - Math.abs(progress - at) / 0.05);
    if (flare > 0) glow(context, x, y, 16, EMBER, 0.7 * flare);
  }
  glow(context, x, y, 7, GOLD, 0.55);
  glow(context, x, y, 2.4, PEARL, 1);
  context.globalCompositeOperation = "source-over";
  const stage = progress < burn ? "plan" : progress < arrive ? "edit" : "reload";
  label(context, stage, x + 10, y - 10, 0.85, "left", true);
};

export const INSTRUMENTS: Instrument[] = [ignition, constellation, meteors, daybreak, transfer];

export const CAPTIONS: ((progress: number) => { title: string; detail: string })[] = [
  (p) => ({ title: "An idea, taking shape", detail: p < 0.14 ? "Waiting for your words" : p < 0.78 ? "Typing the idea" : "Sent to the interview" }),
  (p) => {
    const answered = FIGURE.filter((star) => p >= star.at).length;
    return { title: "Four answers, one brief", detail: p >= 0.83 ? "Brief compiled" : `${answered} of 4 answered` };
  },
  (p) => {
    const written = FILES.filter((file) => p >= file.at).length;
    return { title: "Every file, streamed in", detail: written === FILES.length ? "5 files written" : `${written} of 5 files written` };
  },
  (p) => ({ title: "Daybreak, in its own pod", detail: p < 0.21 ? "Booting the pod" : p < 0.52 ? "Starting the dev server" : "Live" }),
  (p) => ({ title: "A change, planned and applied", detail: p < 0.22 ? "Planning the change" : p < 0.69 ? "Editing 2 files" : "Reloaded in place" }),
];
