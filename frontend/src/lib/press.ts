/**
 * How a button answers the pointer: where the pointer is on it, a slight pull towards it, and a ripple of light from
 * where it was pressed.
 *
 * Handles: keeping the pointer's position on a button as --x/--y in pixels (trackPointer), which the hover fill opens
 * out from and the glow follows; pulling the button a few pixels towards the pointer as --tx/--ty (pullToPointer), for
 * a mouse only and never under reduced motion, and letting it settle back (letGo); and dropping a ripple of light at
 * the point that was pressed (pressRipple), which removes itself once it has faded.
 *
 * These only write custom properties and add one short-lived element, so every look lives in index.css (.lux-btn and
 * .press-ripple) and a button that uses them re-renders nothing while the pointer moves. The pull is a fraction of the
 * button's size, capped by PULL_X/PULL_Y, so a wide button doesn't swing further than a small one. The ripple is sized
 * to reach every corner from wherever the press landed, only follows the primary button of a mouse (or any touch or
 * pen), and is skipped under reduced motion. The element it lands in needs position: relative and overflow: hidden.
 */
const REDUCED = "(prefers-reduced-motion: reduce)";
const PULL_X = 8;
const PULL_Y = 6;

type PointerLike = { currentTarget: EventTarget & HTMLElement; clientX: number; clientY: number };

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;

export function trackPointer(event: PointerLike) {
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  node.style.setProperty("--x", `${(event.clientX - rect.left).toFixed(1)}px`);
  node.style.setProperty("--y", `${(event.clientY - rect.top).toFixed(1)}px`);
}

export function pullToPointer(event: PointerLike & { pointerType: string }) {
  trackPointer(event);
  if (event.pointerType !== "mouse" || reducedMotion()) return;
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dx = (event.clientX - rect.left) / rect.width - 0.5;
  const dy = (event.clientY - rect.top) / rect.height - 0.5;
  node.style.setProperty("--tx", `${(dx * PULL_X).toFixed(2)}px`);
  node.style.setProperty("--ty", `${(dy * PULL_Y).toFixed(2)}px`);
}

export function letGo(event: PointerLike) {
  trackPointer(event);
  event.currentTarget.style.setProperty("--tx", "0px");
  event.currentTarget.style.setProperty("--ty", "0px");
}

export function pressRipple(event: PointerLike & { button?: number }) {
  if ((event.button ?? 0) > 0 || reducedMotion()) return;
  const node = event.currentTarget;
  const rect = node.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const reach = 2 * Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));
  const ripple = document.createElement("span");
  ripple.className = "press-ripple";
  ripple.setAttribute("aria-hidden", "true");
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  ripple.style.width = `${reach}px`;
  ripple.style.height = `${reach}px`;
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  node.appendChild(ripple);
}
