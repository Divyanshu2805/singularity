/**
 * Small helpers shared across the UI.
 *
 * Handles: merging Tailwind class names without conflicts, deriving a project's gradient deterministically from its
 * name, and formatting how long a turn took.
 *
 * The gradient takes its hue from anywhere on the colour wheel, with its two companions close on either side of it,
 * so every project has a colour of its own while a single thumbnail never turns into a rainbow. It was held to the
 * black hole's violet range (hues 236 to 290) until every project on the dashboard looked alike. The duration format mirrors the backend's, which writes the same figure into
 * the saved turn; keep the two in step.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const generateGradient = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 26 + (Math.abs(hash >> 8) % 22)) % 360;
  const h3 = (h1 + 340 - (Math.abs(hash >> 16) % 20)) % 360;

  const c1 = `hsl(${h1}, 78%, 52%)`;
  const c2 = `hsl(${h2}, 76%, 36%)`;
  const c3 = `hsl(${h3}, 70%, 60%)`;

  return {
    background: `
      radial-gradient(at top left, ${c1}, transparent 70%),
      radial-gradient(at bottom right, ${c2}, transparent 70%),
      radial-gradient(at center, ${c3}, transparent 50%),
      hsl(30, 11%, 6%)
    `,
    backgroundSize: '150% 150%',
  };
};

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
