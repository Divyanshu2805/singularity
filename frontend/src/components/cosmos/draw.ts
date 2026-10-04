/**
 * The small drawing kit the landing page's 2D celestial pieces share - the step instruments (instruments.ts) and the
 * feature cards' scenes (feature-scenes.ts) - so every one of them is lit, labelled and starred the same way.
 *
 * Handles: the palette as RGB triplets for building rgba() strings (gold, pearl, ice, ember and the muted label grey),
 * clamping, remapping and easing a progress, a seeded random source so a scene is the same every time it is drawn, a
 * sparse field of faint stars twinkling behind a scene, a soft round glow (a radial gradient that falls to nothing),
 * a star's four diffraction spikes, and a small label in the reading face or the code face.
 */
export const GOLD = "255, 198, 112";
export const PEARL = "255, 247, 234";
export const ICE = "150, 202, 255";
export const EMBER = "255, 142, 64";
export const MUTED = "214, 204, 192";

export const clamp01 = (value: number) => (value <= 0 ? 0 : value >= 1 ? 1 : value);
export const span = (value: number, from: number, to: number) => clamp01((value - from) / (to - from));
export const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
export const easeInOut = (value: number) => {
  const x = clamp01(value);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = Math.imul(state ^ (state >>> 15), 1 | state);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const FIELD = (() => {
  const random = seeded(4417);
  return Array.from({ length: 34 }, () => ({ x: random(), y: random(), r: 0.35 + random() * 0.7, a: 0.15 + random() * 0.4, phase: random() * 6.28 }));
})();

export function field(context: CanvasRenderingContext2D, width: number, height: number, time: number, strength = 1) {
  for (const star of FIELD) {
    context.globalAlpha = star.a * strength * (0.75 + 0.25 * Math.sin(time * 1.3 + star.phase));
    context.fillStyle = `rgb(${PEARL})`;
    context.beginPath();
    context.arc(star.x * width, star.y * height, star.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export function glow(context: CanvasRenderingContext2D, x: number, y: number, radius: number, tint: string, alpha: number) {
  if (alpha <= 0.003 || radius <= 0) return;
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${tint}, ${alpha})`);
  gradient.addColorStop(0.35, `rgba(${tint}, ${alpha * 0.32})`);
  gradient.addColorStop(1, `rgba(${tint}, 0)`);
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export function spikes(context: CanvasRenderingContext2D, x: number, y: number, length: number, alpha: number) {
  if (alpha <= 0.003) return;
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ]) {
    const gradient = context.createLinearGradient(x - dx * length, y - dy * length, x + dx * length, y + dy * length);
    gradient.addColorStop(0, `rgba(${PEARL}, 0)`);
    gradient.addColorStop(0.5, `rgba(${PEARL}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${PEARL}, 0)`);
    context.strokeStyle = gradient;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x - dx * length, y - dy * length);
    context.lineTo(x + dx * length, y + dy * length);
    context.stroke();
  }
}

export function label(context: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number, align: CanvasTextAlign = "center", mono = false) {
  if (alpha <= 0.01) return;
  context.globalAlpha = alpha;
  context.fillStyle = `rgb(${MUTED})`;
  context.font = mono ? "500 9.5px 'JetBrains Mono', monospace" : "500 10.5px Inter, system-ui, sans-serif";
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text, x, y);
  context.globalAlpha = 1;
}

