/**
 * Gold dust rising off a text field's caret as someone types - the sign-in form's fields (AuthField) use it.
 *
 * Handles: finding where the caret sits inside a field (caretX: the field's left padding plus the width of the text
 * before the caret, measured on one shared canvas in the field's own font, less however far the field has scrolled
 * sideways, and held inside the field's box), and releasing motes there (emitStardust): each a tiny gold point with a
 * soft glow, given its own size, a little sideways drift and a rise of a dozen pixels or so, fading out on the way up
 * (index.css, .stardust) and removing itself once it has gone. A password field shows a bullet per character rather
 * than the text, so the bullets are what is measured there. One mote is released per character typed and a small
 * cluster for a paste; a field never carries more than MAX_MOTES at once, so holding a key down cannot pile them up.
 * Under reduced motion, and where the browser cannot measure text, nothing is released.
 */

const REDUCED = "(prefers-reduced-motion: reduce)";
const MAX_MOTES = 14;
const BULLET = "•";

let ruler: CanvasRenderingContext2D | null | undefined;

function measureWidth(text: string, font: string) {
    if (ruler === undefined) {
        try {
            ruler = document.createElement("canvas").getContext("2d");
        } catch {
            ruler = null;
        }
    }
    if (!ruler) return null;
    ruler.font = font;
    return ruler.measureText(text).width;
}

export function caretX(input: HTMLInputElement) {
    const style = window.getComputedStyle(input);
    const end = input.selectionEnd ?? input.value.length;
    const before = input.type === "password" ? BULLET.repeat(end) : input.value.slice(0, end);
    const width = measureWidth(before, style.font || `${style.fontSize} ${style.fontFamily}`);
    if (width === null) return null;
    const padding = parseFloat(style.paddingLeft) || 0;
    const inside = Math.min(input.clientWidth - 2, Math.max(0, padding + width - input.scrollLeft));
    return input.offsetLeft + inside;
}

export function emitStardust(input: HTMLInputElement, host: HTMLElement, count = 1) {
    if (window.matchMedia(REDUCED).matches || typeof host.animate !== "function") return;
    const x = caretX(input);
    if (x === null) return;
    const y = input.offsetTop + input.offsetHeight / 2;
    const room = Math.max(0, MAX_MOTES - host.querySelectorAll(".stardust").length);

    for (let index = 0; index < Math.min(count, room); index++) {
        const mote = document.createElement("span");
        mote.className = "stardust";
        mote.setAttribute("aria-hidden", "true");
        const size = 1.6 + Math.random() * 2;
        mote.style.cssText = [
            `left:${x + (Math.random() - 0.5) * 4}px`,
            `top:${y}px`,
            `--s:${size.toFixed(2)}px`,
            `--dx:${((Math.random() - 0.5) * 14).toFixed(1)}px`,
            `--dy:${(-(11 + Math.random() * 11)).toFixed(1)}px`,
            `--t:${Math.round(780 + Math.random() * 420)}ms`,
            `animation-delay:${index * 45}ms`,
        ].join(";");
        mote.addEventListener("animationend", () => mote.remove(), { once: true });
        host.appendChild(mote);
    }
}
