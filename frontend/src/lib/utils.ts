import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Helper for deterministic gradient generation - each project gets a unique but
// palette-coherent abstract wash (like hand-poured resin), not a random rainbow hue.
// Hues stay within the warm copper/forge family (roughly amber through rust to ember-rose)
// that the rest of the UI is built from, so the dashboard reads as one designed thing.
export const generateGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const warmHue = (offset: number) => 8 + (Math.abs(hash >> offset) % 55); // ~8deg (rose) .. ~63deg (amber)

  const h1 = warmHue(0);
  const h2 = warmHue(8);
  const h3 = warmHue(16);

  const c1 = `hsl(${h1}, 68%, 52%)`;
  const c2 = `hsl(${h2}, 72%, 42%)`;
  const c3 = `hsl(${h3}, 55%, 62%)`;

  return {
    background: `
      radial-gradient(at top left, ${c1}, transparent 70%),
      radial-gradient(at bottom right, ${c2}, transparent 70%),
      radial-gradient(at center, ${c3}, transparent 50%),
      hsl(30, 15%, 9%)
    `,
    backgroundSize: '150% 150%', // To allow for some blurry overlap
  };
};

/**
 * How long a turn took, written the way a person reads a clock: `45s`, `3m 40s`, `1h 2m`. A real multi-file
 * build runs for minutes, and `220s` makes the reader do the division themselves.
 *
 * <p>Mirrors `DurationFormat.worked` on the backend, which writes the same string into the saved `THOUGHT`
 * event - this is what the browser shows for the same turn until that event arrives. Keep the two in step.
 */
export function formatWorkedFor(seconds: number): string {
  const total = Math.max(1, Math.round(seconds));
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  if (minutes < 60) return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
