/**
 * Where the pointer is on a button, so the button's light can sit under it.
 *
 * Handles: watching pointer movement across the page and, whenever it is over one of the app's buttons, writing the
 * pointer's position inside that button into two CSS variables on it (--bx and --by, in pixels from its top-left
 * corner). The stylesheet places every button's hover light at that point (index.css, the buttons' light), which is
 * what makes a button light up on the side the pointer is on and the light follow the pointer across it. The
 * dashboard's quick-start chips and the chat's suggestion cards (.idea-chip, .prompt-card) count as buttons here.
 *
 * It is one listener on the document rather than handlers on every button, so a button rendered anywhere - a
 * dialog, a menu's trigger, a page added later - gets the light without being wired up. A button the pointer has
 * never been on has neither variable, and the stylesheet's fallback puts the light at its centre: that is the case
 * for keyboard focus and for a trigger shown as open.
 */
const BUTTONS = ".btn, .app-chip, .app-send, .app-stop, .idea-chip, .prompt-card";

export function buttonLightAt(target: EventTarget | null, clientX: number, clientY: number) {
  if (!(target instanceof Element)) return;
  const button = target.closest<HTMLElement>(BUTTONS);
  if (!button) return;
  const box = button.getBoundingClientRect();
  button.style.setProperty("--bx", `${Math.round(clientX - box.left)}px`);
  button.style.setProperty("--by", `${Math.round(clientY - box.top)}px`);
}

export function installButtonLight() {
  document.addEventListener("pointermove", (event) => buttonLightAt(event.target, event.clientX, event.clientY), { passive: true });
}
