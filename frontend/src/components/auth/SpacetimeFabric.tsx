/**
 * The sheet of space-time the "Continue with Google" button is woven from - and, since the owner asked for the same
 * fabric there, the sidebar's "New project" row, whose mass is its plus badge (ProjectSidebar.tsx).
 *
 * Handles: a fine grid drawn on a canvas behind the button's label (CELL apart, and BEYOND the button's box on every
 * side, so that there is always more sheet to be drawn into view), bent by two masses and rippled by one of them.
 * The first mass is the mark the button carries (mass - the Google G, or the comet that stands in for it while the
 * popup is open): the sheet dips a little towards it (DIP), is a shade brighter round it, stops short of it (CLEAR)
 * so that no line crosses the mark, and slow rings spread from it along the sheet (RIPPLE, one every RIPPLE_MS). The
 * second is the pointer: while it is on the button the sheet sinks towards it (WELL, deeper while the button is held
 * down, PRESS), the lines round it come up gold, and the well trails the pointer by a breath (FOLLOW_MS) and opens and
 * closes on a spring (SPRING_MS) - so it overshoots a touch and settles, as cloth does when a weight is set on it or
 * taken off. A few stars lie on the sheet (STARS: across and down as fractions of the button, size in pixels, and a
 * delay and a period in seconds for their own slow beats); they are carried by it, further than the lines are
 * (STAR_CARRY), so they slide towards the pointer and brighten as they near it, which is what makes the pull read as
 * gravity rather than as a pattern changing. While the button waits on Google (busy) the rings grow and quicken
 * (BUSY_GAIN, BUSY_PACE): the comet circling where the G was sends waves out across the sheet until the answer comes.
 * While the button is switched off for some other reason (asleep - the email form is being sent) the sheet goes flat
 * and the loop stops.
 *
 * The owner asked for a space-time fabric or a star animation on this button and left the idea open. This is the
 * fabric with the stars lying on it, answering the pointer rather than looping by itself, so the page's two halves
 * say the same thing - the pointer has mass (the tagline's lens and GravityLens on the left, this on the right). It
 * is seen from straight above, as a flat grid. A second drawing was tried straight after - the sheet seen at an
 * angle, as rows of threads that sag and ripple, with and without cross threads - and the owner asked for this one
 * back at once ("the previous one ... was perfect"), so its look is not to be retuned without being asked.
 *
 * The geometry is lib/spacetime.ts's; this file only turns it into lines. The canvas takes no pointer events, so it
 * listens on the button it sits in, and it reads where the mark is on every frame rather than once, since the label
 * beside the mark changes width (signing in, signing up, waiting). Every level - the well's depth, the rings' size
 * and pace, where the dip is - is kept between runs of the effect and eased, so nothing jumps when the button changes
 * state. The loop runs only while the canvas is on screen. Only a mouse opens the well. Under reduced motion one
 * still frame is drawn - the sheet flat but for the dip, the stars half lit - and left.
 */
import { useEffect, useRef, type RefObject } from "react";
import { useInView, usePrefersReducedMotion } from "@/components/landing/motion";
import { ringAt, sinkAt, sinkLimit, springTowards, type Spring } from "@/lib/spacetime";

const CELL = 12;
const STEP = 4;
const BEYOND = 24;
const LINE = 0.06;
const WELL = 9;
const WELL_REACH = 112;
const WELL_LIT = 0.22;
const WELL_GLOW = 84;
const PRESS = 0.5;
const SPRING_MS = 520;
const SPRING_DAMPING = 0.5;
const FOLLOW_MS = 85;
const DIP = 3.2;
const DIP_REACH = 56;
const DIP_LIT = 0.09;
const DIP_GLOW = 46;
const DIP_FOLLOW_MS = 160;
const CLEAR = { from: 9, to: 17 };
const RIPPLE = 1.1;
const RIPPLE_SPAN = 84;
const RIPPLE_REACH = 190;
const RIPPLE_CALM = 22;
const RIPPLE_MS = 5200;
const HOVER_GAIN = 0.5;
const BUSY_GAIN = 1.5;
const BUSY_PACE = 2.6;
const EASE_MS = 600;
const STAR_CARRY = 1.6;
const STAR_DIM = 0.16;
const STAR_REST = 0.6;
const STAR_CORE = "hsl(46 100% 90%)";
const STAR_HALO = "hsl(40 100% 62%)";
const STARS = [
    [0.075, 0.36, 1.1, 0.4, 6.5],
    [0.15, 0.7, 0.8, 2.2, 8],
    [0.235, 0.27, 0.9, 3.6, 7],
    [0.72, 0.68, 0.8, 1.2, 7.5],
    [0.8, 0.3, 1.2, 4.1, 9],
    [0.875, 0.62, 0.9, 0.9, 6],
    [0.94, 0.4, 0.8, 2.9, 8.5],
];

type Point = { x: number; y: number };
type Sheet = { mass: Point | null; well: Point; lift: Spring; swell: number; pace: number; turn: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number, sheet: Sheet, age: number | null) {
    const { mass, well } = sheet;
    const depth = Math.min(WELL * sheet.lift.at, sinkLimit(WELL_REACH) * 0.92);
    const lit = clamp01(sheet.lift.at);
    let px = 0;
    let py = 0;
    const sway = (x: number, y: number, carry: number) => {
        let sx = 0;
        let sy = 0;
        if (mass) {
            const dx = mass.x - x;
            const dy = mass.y - y;
            const out = Math.hypot(dx, dy);
            if (out > 0.5) {
                const draw = sinkAt(out, DIP, DIP_REACH) - ringAt(out, sheet.swell, RIPPLE_SPAN, RIPPLE_REACH, RIPPLE_CALM, sheet.turn);
                sx += (dx / out) * draw;
                sy += (dy / out) * draw;
            }
        }
        if (depth !== 0) {
            const dx = well.x - x;
            const dy = well.y - y;
            const out = Math.hypot(dx, dy);
            if (out > 0.5) {
                const draw = sinkAt(out, depth, WELL_REACH);
                sx += (dx / out) * draw;
                sy += (dy / out) * draw;
            }
        }
        px = x + sx * carry;
        py = y + sy * carry;
    };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    const across = Math.ceil((w / 2 + BEYOND) / CELL);
    const down = Math.ceil((h / 2 + BEYOND) / CELL);
    for (let column = -across; column < across; column += 1) {
        const x = Math.floor(w / 2 + (column + 0.5) * CELL) + 0.5;
        for (let y = -BEYOND; y <= h + BEYOND; y += STEP) {
            sway(x, y, 1);
            if (y === -BEYOND) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
    }
    for (let row = -down; row < down; row += 1) {
        const y = Math.floor(h / 2 + (row + 0.5) * CELL) + 0.5;
        for (let x = -BEYOND; x <= w + BEYOND; x += STEP) {
            sway(x, y, 1);
            if (x === -BEYOND) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = `hsl(40 30% 90% / ${LINE})`;
    ctx.stroke();
    if (mass) {
        const near = ctx.createRadialGradient(mass.x, mass.y, 0, mass.x, mass.y, DIP_GLOW);
        near.addColorStop(0, `hsl(44 100% 82% / ${DIP_LIT})`);
        near.addColorStop(1, "hsl(44 100% 82% / 0)");
        ctx.strokeStyle = near;
        ctx.stroke();
    }
    if (lit > 0.004) {
        const pool = ctx.createRadialGradient(well.x, well.y, 0, well.x, well.y, WELL_GLOW);
        pool.addColorStop(0, `hsl(44 100% 80% / ${(WELL_LIT * lit).toFixed(3)})`);
        pool.addColorStop(1, "hsl(44 100% 80% / 0)");
        ctx.strokeStyle = pool;
        ctx.stroke();
    }

    if (mass) {
        ctx.globalCompositeOperation = "destination-out";
        const clear = ctx.createRadialGradient(mass.x, mass.y, CLEAR.from, mass.x, mass.y, CLEAR.to);
        clear.addColorStop(0, "rgb(0 0 0 / 1)");
        clear.addColorStop(1, "rgb(0 0 0 / 0)");
        ctx.fillStyle = clear;
        ctx.fillRect(mass.x - CLEAR.to, mass.y - CLEAR.to, CLEAR.to * 2, CLEAR.to * 2);
        ctx.globalCompositeOperation = "source-over";
    }

    for (const [across, down, size, delay, period] of STARS) {
        sway(across * w, down * h, STAR_CARRY);
        const beat = age === null ? 0.25 : (age / 1000 + delay) / period;
        const twinkle = 0.5 - 0.5 * Math.cos(beat * Math.PI * 2);
        const near = lit * clamp01(1 - Math.hypot(px - well.x, py - well.y) / WELL_GLOW);
        const glow = STAR_DIM + (1 - STAR_DIM) * Math.max(twinkle * STAR_REST, near);
        ctx.globalAlpha = glow * 0.22;
        ctx.fillStyle = STAR_HALO;
        ctx.beginPath();
        ctx.arc(px, py, size * 2.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = glow;
        ctx.fillStyle = STAR_CORE;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
}

export function SpacetimeFabric({ mass, busy = false, asleep = false }: { mass: RefObject<HTMLElement>; busy?: boolean; asleep?: boolean }) {
    const reduced = usePrefersReducedMotion();
    const [canvasRef, visible] = useInView<HTMLCanvasElement>({ once: false, threshold: 0, rootMargin: "0px" });
    const sheet = useRef<Sheet>({ mass: null, well: { x: 0, y: 0 }, lift: { at: 0, speed: 0 }, swell: 0, pace: 1, turn: 0 });
    const born = useRef(0);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const button = canvas?.parentElement;
        if (!canvas || !ctx || !button) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const state = sheet.current;
        const aim = { ...state.well };
        let live = true;
        let over = false;
        let pressed = false;
        let w = 0;
        let h = 0;
        let frame = 0;
        let then = 0;
        if (!born.current) born.current = performance.now();

        const locate = (follow: number) => {
            const node = mass.current;
            const box = canvas.getBoundingClientRect();
            if (!node || !box.width || !box.height) return;
            const at = node.getBoundingClientRect();
            const x = ((at.left + at.width / 2 - box.left) / box.width) * w;
            const y = ((at.top + at.height / 2 - box.top) / box.height) * h;
            if (!state.mass) state.mass = { x, y };
            else {
                state.mass.x += (x - state.mass.x) * follow;
                state.mass.y += (y - state.mass.y) * follow;
            }
        };
        const draw = (now: number) => paint(ctx, w, h, dpr, state, reduced ? null : now - born.current);
        const size = () => {
            w = canvas.clientWidth;
            h = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(w * dpr));
            canvas.height = Math.max(1, Math.round(h * dpr));
            locate(1);
            draw(performance.now());
        };
        const tick = (now: number) => {
            frame = window.requestAnimationFrame(tick);
            const elapsed = then ? Math.min(now - then, 64) : 16;
            then = now;
            locate(1 - Math.exp(-elapsed / DIP_FOLLOW_MS));
            const near = 1 - Math.exp(-elapsed / FOLLOW_MS);
            state.well.x += (aim.x - state.well.x) * near;
            state.well.y += (aim.y - state.well.y) * near;
            springTowards(state.lift, over ? (pressed ? 1 + PRESS : 1) : 0, elapsed, SPRING_MS, SPRING_DAMPING);
            const ease = 1 - Math.exp(-elapsed / EASE_MS);
            const swell = asleep ? 0 : RIPPLE * (1 + (busy ? BUSY_GAIN : HOVER_GAIN * clamp01(state.lift.at)));
            state.swell += (swell - state.swell) * ease;
            state.pace += ((busy ? 1 + BUSY_PACE : 1) - state.pace) * ease;
            state.turn = (state.turn + (elapsed / RIPPLE_MS) * Math.PI * 2 * state.pace) % (Math.PI * 2);
            draw(now);
            if (asleep && state.swell < 0.02 && Math.abs(state.lift.at) < 0.004 && Math.abs(state.lift.speed) < 0.02) {
                window.cancelAnimationFrame(frame);
                frame = 0;
            }
        };
        const onMove = (event: PointerEvent) => {
            if (event.pointerType !== "mouse") return;
            const box = canvas.getBoundingClientRect();
            if (!box.width || !box.height) return;
            aim.x = ((event.clientX - box.left) / box.width) * w;
            aim.y = ((event.clientY - box.top) / box.height) * h;
            if (!over && Math.abs(state.lift.at) < 0.05) {
                state.well.x = aim.x;
                state.well.y = aim.y;
            }
            over = true;
        };
        const onLeave = () => {
            over = false;
            pressed = false;
        };
        const onDown = (event: PointerEvent) => {
            if (event.pointerType === "mouse" && event.button === 0) pressed = true;
        };
        const onUp = () => {
            pressed = false;
        };

        size();
        const sizes = new ResizeObserver(size);
        sizes.observe(canvas);
        void document.fonts?.ready.then(() => {
            if (live && !frame) size();
        });
        if (visible && !reduced) {
            frame = window.requestAnimationFrame(tick);
            if (!busy && !asleep) {
                button.addEventListener("pointermove", onMove);
                button.addEventListener("pointerleave", onLeave);
                button.addEventListener("pointerdown", onDown);
                button.addEventListener("pointerup", onUp);
            }
        }
        return () => {
            live = false;
            window.cancelAnimationFrame(frame);
            sizes.disconnect();
            button.removeEventListener("pointermove", onMove);
            button.removeEventListener("pointerleave", onLeave);
            button.removeEventListener("pointerdown", onDown);
            button.removeEventListener("pointerup", onUp);
        };
    }, [canvasRef, mass, visible, reduced, busy, asleep]);

    return <canvas ref={canvasRef} aria-hidden="true" className="auth-fabric" />;
}
