/**
 * Where the hero's eclipse stands, shared by the shader that draws it (Corona.tsx) and the page laid out round it.
 *
 * Handles: the moon's radius for a given width, the line of the planet's limb, and the moon's centre above it - all
 * in CSS pixels of the box the eclipse is drawn in - so the hero's copy and anything that rises from behind the
 * horizon can be placed against the same numbers the light is drawn from; the limb's height at any point across the
 * box (limbAt), on the same sphere the shader draws; and the scene a pinning section writes for the shader each
 * frame (EclipseScene: how far the light has dimmed, and how far the whole view has sunk down the screen).
 *
 * It is a module of its own so that Corona.tsx exports a component only, which keeps it hot-reloadable.
 */
export const RADIUS_MIN = 40;
export const RADIUS_MAX = 78;
export const RADIUS_SHARE = 0.05;
export const HORIZON = 0.86;
export const LIFT = 1.42;

export interface EclipseScene {
  dim: number;
  sink: number;
}

export interface EclipseGeometry {
  width: number;
  height: number;
  radius: number;
  centerX: number;
  centerY: number;
  horizon: number;
}

export function eclipseGeometry(width: number, height: number): EclipseGeometry {
  const radius = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, width * RADIUS_SHARE));
  const horizon = height * HORIZON;
  return { width, height, radius, centerX: width / 2, centerY: horizon - LIFT * radius, horizon };
}

export const PLANET_SPAN = 4.5;

export function limbAt(geometry: EclipseGeometry, x: number, sink = 0) {
  const radius = geometry.width * PLANET_SPAN;
  const dx = x - geometry.centerX;
  return geometry.horizon + sink + radius - Math.sqrt(Math.max(0, radius * radius - dx * dx));
}
