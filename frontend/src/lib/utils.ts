/**
 * Small helpers shared across the UI.
 *
 * Handles: merging Tailwind class names without conflicts, deriving a project's gradient deterministically from its
 * name, and formatting how long a turn took.
 *
 * The gradient stays within the warm palette the rest of the UI is built from, so the dashboard reads as one designed
 * thing rather than a random rainbow. The duration format mirrors the backend's, which writes the same figure into
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

  const warmHue = (offset: number) => 8 + (Math.abs(hash >> offset) % 55);

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
